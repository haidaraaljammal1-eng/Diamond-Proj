import type { NotificationPayload } from "src/modules/notification-delivery/notification.types";

export interface PushoverRuntimeConfig {
  appToken: string;
  userKey: string;
}

export interface PushoverSendInput extends NotificationPayload {}

export interface PushoverApiSuccessResponse {
  status: 1;
  request: string;
}

export interface PushoverApiFailureResponse {
  status: number;
  errors?: string[];
  request?: string;
}

export type PushoverApiResponse = PushoverApiSuccessResponse | PushoverApiFailureResponse;

export interface PushoverSendOutcome {
  statusCode: number;
  providerStatus?: number;
  requestId?: string;
  errors?: string[];
}
