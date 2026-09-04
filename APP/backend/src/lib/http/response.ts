import { z } from "zod";

/**
 * Standard response envelope helpers.
 *   Success: { data, meta? }
 *   Error:   { error: { code, message, ... } }  (see error-handler.ts)
 * Use these builders so every route's response schema is consistent and the
 * generated OpenAPI/client stays uniform.
 */

export const PageMetaSchema = z.object({
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
  totalPages: z.number().int(),
});
export type PageMeta = z.infer<typeof PageMetaSchema>;

/** `{ data: <schema> }` */
export function dataResponse<T extends z.ZodTypeAny>(schema: T) {
  return z.object({ data: schema });
}

/** `{ data: <schema>[], meta }` for paginated collections. */
export function listResponse<T extends z.ZodTypeAny>(schema: T) {
  return z.object({ data: z.array(schema), meta: PageMetaSchema });
}

export const MessageResponseSchema = z.object({
  data: z.object({ message: z.string() }),
});

export const ErrorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.any().optional(),
    context: z.record(z.string(), z.any()).optional(),
    conflicts: z.array(z.any()).optional(),
    suggestedActions: z.array(z.any()).optional(),
    requestId: z.string(),
  }),
});

/** Shared error responses to attach to protected routes' schema.response. */
export const commonErrorResponses = {
  400: ErrorResponseSchema,
  401: ErrorResponseSchema,
  403: ErrorResponseSchema,
  404: ErrorResponseSchema,
  409: ErrorResponseSchema,
  422: ErrorResponseSchema,
  429: ErrorResponseSchema,
  500: ErrorResponseSchema,
};

export function data<T>(payload: T): { data: T } {
  return { data: payload };
}

export function message(text: string): { data: { message: string } } {
  return { data: { message: text } };
}
