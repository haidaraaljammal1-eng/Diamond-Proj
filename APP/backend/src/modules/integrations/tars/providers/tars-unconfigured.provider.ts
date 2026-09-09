import { TARS_ERROR_REASONS } from "src/modules/integrations/tars/tars.errors";
import type {
  TarsProvider,
  TarsProviderResult,
} from "src/modules/integrations/tars/tars.types";

/**
 * Fail-closed TARS provider — the only provider that exists today.
 *
 * It performs no network call and, critically, fabricates nothing: no
 * externalContractId, no externalReference, no providerOperationId, no success
 * and no sync timestamp. TarsIntegrationService checks `configured` and rejects
 * with TARS_NOT_CONFIGURED before any operation row is written, so these
 * methods are a second line of defence rather than the normal path.
 */
export class TarsUnconfiguredProvider implements TarsProvider {
  readonly name = "none";
  readonly configured = false;

  private notConfigured(): TarsProviderResult {
    return { success: false, errorCode: TARS_ERROR_REASONS.NOT_CONFIGURED };
  }

  async registerContract(): Promise<TarsProviderResult> {
    return this.notConfigured();
  }

  async submitContractAcceptance(): Promise<TarsProviderResult> {
    return this.notConfigured();
  }

  async submitHandover(): Promise<TarsProviderResult> {
    return this.notConfigured();
  }

  async submitReturn(): Promise<TarsProviderResult> {
    return this.notConfigured();
  }

  async completeContract(): Promise<TarsProviderResult> {
    return this.notConfigured();
  }
}
