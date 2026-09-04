export interface ApiResponse<T> {
  data: T;
  meta?: unknown;
}

export interface ApiResponseWithMeta<T, M> {
  data: T;
  meta: M;
}

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
  context?: Record<string, unknown>;
  conflicts?: unknown[];
  suggestedActions?: unknown[];
  requestId?: string;
}

export interface ApiErrorResponse {
  error: ApiError;
}
