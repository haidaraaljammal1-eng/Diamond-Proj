export type PassportNumberApiStatus = "VALID" | "REVIEW";

export interface PassportNumberApiSuccessBody {
  passport_number: string | null;
  status: PassportNumberApiStatus;
}

export type PassportNumberApiClientErrorCode =
  | "NOT_CONFIGURED"
  | "TIMEOUT"
  | "CONNECTION_FAILED"
  | "INVALID_RESPONSE"
  | "HTTP_ERROR";

export type PassportNumberEngineOutcome =
  | {
      kind: "business";
      status: "VALID";
      passportNumber: string;
      provider: string;
      providerVersion: string | null;
    }
  | {
      kind: "business";
      status: "REVIEW";
      provider: string;
      providerVersion: string | null;
    }
  | {
      kind: "error";
      code: PassportNumberApiClientErrorCode;
      provider: string;
      providerVersion: string | null;
    };

export interface PassportNumberImageInput {
  bytes: Buffer;
  mimeType: string;
  filename?: string;
}
