export type NotificationPriority = "normal" | "high";

export interface NotificationPayload {
  title: string;
  message: string;
  priority?: NotificationPriority;
  url?: string;
  urlTitle?: string;
}

export type NotificationErrorCode =
  | "DISABLED"
  | "NOT_CONFIGURED"
  | "TIMEOUT"
  | "NETWORK_ERROR"
  | "HTTP_ERROR"
  | "INVALID_RESPONSE"
  | "PROVIDER_REJECTED"
  | "UNEXPECTED_ERROR";

export interface NotificationSendResult {
  success: boolean;
  provider: string;
  requestId?: string;
  statusCode?: number;
  /** Opaque provider response status when available (Pushover uses numeric status). */
  providerStatus?: number;
  errorCode?: NotificationErrorCode;
}

export interface NotificationProvider {
  readonly name: string;
  readonly configured: boolean;
  send(payload: NotificationPayload): Promise<NotificationSendResult>;
}
