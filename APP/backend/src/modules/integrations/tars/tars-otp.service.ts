import type { FastifyInstance } from "fastify";

import {

  TARS_OTP_MAX_VERIFY_ATTEMPTS,

  TARS_OTP_RESEND_COOLDOWN_SECONDS,

  type TarsOtpUiStatus,

} from "src/modules/integrations/tars/tars.constants";

import { tarsError } from "src/modules/integrations/tars/tars.errors";

import { createTarsProvider } from "src/modules/integrations/tars/tars.provider";

import type { TarsOtpPublicState } from "src/modules/integrations/tars/tars.types";



function safeErrorCode(code: string | undefined): string {

  return (code ?? "TARS_PROVIDER_ERROR").slice(0, 64);

}



function unconfiguredState(): TarsOtpPublicState {

  return {

    providerConfigured: false,

    required: false,

    status: "NOT_REQUIRED",

    maskedDestination: null,

    resendAvailableAt: null,

    expiresAt: null,

    otpLength: null,

    attemptsRemaining: null,

  };

}



/**

 * TARS OTP foundation. OTP values are never stored, logged, or echoed in audit

 * metadata. Verification is authoritative from the provider only.

 */

export function createTarsOtpService(fastify: FastifyInstance) {

  const prisma = fastify.prisma;



  async function loadContractForOtp(contractId: string) {

    const row = await prisma.contract.findUnique({

      where: { id: contractId },

      select: {

        id: true,

        contractNumber: true,

        status: true,

        termsVersion: true,

        company: { select: { id: true, code: true } },

        customer: { select: { mobile: true } },

      },

    });

    if (!row) throw tarsError.contractNotFound();

    if (!row.customer?.mobile) {

      throw tarsError.mappingIncomplete("CONTRACT_ACCEPTANCE", ["customer.mobile"]);

    }

    return row;

  }



  function mapChallengeToState(

    providerConfigured: boolean,

    required: boolean,

    latest: {

      status: string;

      maskedDestination: string | null;

      requestedAt: Date;

      expiresAt: Date | null;

      attemptCount: number;

      maxAttempts: number | null;

      otpLength: number | null;

      resendAvailableAt: Date | null;

    } | null,

  ): TarsOtpPublicState {

    if (!providerConfigured) return unconfiguredState();

    if (!required) {

      return { ...unconfiguredState(), providerConfigured: true, required: false };

    }

    if (!latest) {

      return {

        providerConfigured: true,

        required: true,

        status: "NOT_STARTED",

        maskedDestination: null,

        resendAvailableAt: null,

        expiresAt: null,

        otpLength: null,

        attemptsRemaining: null,

      };

    }



    const maxAttempts = latest.maxAttempts ?? TARS_OTP_MAX_VERIFY_ATTEMPTS;

    const attemptsRemaining = Math.max(0, maxAttempts - latest.attemptCount);

    const expiredByTime =

      latest.expiresAt != null && latest.expiresAt.getTime() < Date.now();

    const expired = latest.status === "EXPIRED" || expiredByTime;



    let status: TarsOtpUiStatus;

    if (latest.status === "VERIFIED") status = "VERIFIED";
    else if (latest.status === "FAILED") status = "FAILED";
    else if (expired) status = "EXPIRED";
    else if (attemptsRemaining === 0) status = "RATE_LIMITED";
    else status = "CODE_SENT";



    const resendAvailableAt =

      latest.resendAvailableAt ??

      new Date(latest.requestedAt.getTime() + TARS_OTP_RESEND_COOLDOWN_SECONDS * 1000);



    return {

      providerConfigured: true,

      required: true,

      status,

      maskedDestination: latest.maskedDestination,

      resendAvailableAt:

        resendAvailableAt.getTime() > Date.now() ? resendAvailableAt : null,

      expiresAt: latest.expiresAt,

      otpLength: latest.otpLength,

      attemptsRemaining: latest.status === "VERIFIED" ? null : attemptsRemaining,

    };

  }



  async function getPublicState(contractId: string): Promise<TarsOtpPublicState> {

    const contract = await prisma.contract.findUnique({

      where: { id: contractId },

      select: { company: { select: { code: true } } },

    });

    if (!contract) throw tarsError.contractNotFound();



    const provider = createTarsProvider(contract.company.code);

    if (!provider.configured) return unconfiguredState();



    const latest = await prisma.tarsContractOtpChallenge.findFirst({

      where: { contractId },

      orderBy: { createdAt: "desc" },

    });



    return mapChallengeToState(true, true, latest);

  }



  async function isVerificationSatisfied(contractId: string): Promise<boolean> {

    const state = await getPublicState(contractId);

    if (!state.required) return true;

    return state.status === "VERIFIED";

  }



  async function requestOtp(contractId: string) {

    const row = await loadContractForOtp(contractId);

    const provider = createTarsProvider(row.company.code);

    if (!provider.configured) throw tarsError.notConfigured();



    const latest = await prisma.tarsContractOtpChallenge.findFirst({

      where: { contractId, status: "REQUESTED" },

      orderBy: { createdAt: "desc" },

    });

    if (latest) {

      const canResendAt =

        latest.resendAvailableAt ??

        new Date(latest.requestedAt.getTime() + TARS_OTP_RESEND_COOLDOWN_SECONDS * 1000);

      if (canResendAt.getTime() > Date.now()) {

        throw tarsError.otpResendCooldown();

      }

    }



    const result = await provider.requestContractOtp({

      company: { companyId: row.company.id, companyCode: row.company.code },

      contract: {

        contractId: row.id,

        contractNumber: row.contractNumber,

        status: row.status,

        termsVersion: row.termsVersion,

      },

      customerMobile: row.customer!.mobile!,

    });



    if (!result.success) {

      throw tarsError.otpRequestFailed(result.errorCode);

    }



    await prisma.tarsContractOtpChallenge.create({

      data: {

        contractId,

        provider: provider.companyCode,

        challengeReference: result.challengeReference ?? null,

        maskedDestination: result.maskedDestination ?? null,

        status: "REQUESTED",

        expiresAt: result.expiresAt ?? null,

        resendAvailableAt: result.resendAvailableAt ?? null,

        otpLength: result.otpLength ?? null,

        maxAttempts: result.maxAttempts ?? null,

      },

    });



    return getPublicState(contractId);

  }



  async function verifyOtp(contractId: string, code: string) {

    const row = await loadContractForOtp(contractId);

    const provider = createTarsProvider(row.company.code);

    if (!provider.configured) throw tarsError.notConfigured();



    const challenge = await prisma.tarsContractOtpChallenge.findFirst({

      where: { contractId, status: "REQUESTED" },

      orderBy: { createdAt: "desc" },

    });

    if (!challenge || !challenge.challengeReference) {

      throw tarsError.otpNotRequested();

    }

    if (challenge.provider !== provider.companyCode && challenge.provider !== "fake") {

      throw tarsError.externalIdCompanyMismatch();

    }

    if (challenge.expiresAt && challenge.expiresAt.getTime() < Date.now()) {

      await prisma.tarsContractOtpChallenge.update({

        where: { id: challenge.id },

        data: { status: "EXPIRED" },

      });

      throw tarsError.otpExpired();

    }

    const maxAttempts = challenge.maxAttempts ?? TARS_OTP_MAX_VERIFY_ATTEMPTS;

    if (challenge.attemptCount >= maxAttempts) {

      throw tarsError.otpAttemptsExceeded();

    }



    const result = await provider.verifyContractOtp({

      company: { companyId: row.company.id, companyCode: row.company.code },

      contract: {

        contractId: row.id,

        contractNumber: row.contractNumber,

        status: row.status,

        termsVersion: row.termsVersion,

      },

      challengeReference: challenge.challengeReference,

      code,

    });



    const nextAttempts = challenge.attemptCount + 1;

    await prisma.tarsContractOtpChallenge.update({

      where: { id: challenge.id },

      data: {

        attemptCount: nextAttempts,

        lastErrorCode: result.success ? null : safeErrorCode(result.errorCode),

        status: result.success

          ? "VERIFIED"

          : nextAttempts >= maxAttempts

            ? "FAILED"

            : "REQUESTED",

        verifiedAt: result.success ? result.verifiedAt ?? new Date() : null,

      },

    });



    if (!result.success) {

      throw tarsError.invalidOtpCode();

    }



    return getPublicState(contractId);

  }



  return {

    getPublicState,

    isVerificationSatisfied,

    requestOtp,

    verifyOtp,

  };

}



export type TarsOtpService = ReturnType<typeof createTarsOtpService>;


