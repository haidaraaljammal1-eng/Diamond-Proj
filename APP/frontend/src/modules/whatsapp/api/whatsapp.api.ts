import { apiRequest } from "@/infrastructure/api/client";
import { env } from "@/config/env";
import type {
  WhatsAppConnectionAttemptStartDto,
  WhatsAppConnectionDto,
  WhatsAppConversationDetailDto,
  WhatsAppConversationListItemDto,
  WhatsAppCustomerMatchDto,
  WhatsAppGrantedChoiceDto,
  WhatsAppLinkedCustomerDto,
  WhatsAppListQuery,
  WhatsAppMessageDto,
  WhatsAppMessageQuery,
  WhatsAppPageMeta,
  WhatsAppSendResult,
  WhatsAppTemplateDto,
} from "../types/whatsapp.types";
import { WHATSAPP_MESSAGE_PAGE_SIZE } from "../types/whatsapp.types";
import { buildWhatsAppConversationQuery, parseWhatsAppPageMeta } from "../utils/whatsapp-query";

const WHATSAPP_PATH = "/whatsapp";

async function accessToken(): Promise<string | undefined> {
  if (typeof window === "undefined") return undefined;
  const { getSession } = await import("next-auth/react");
  return (await getSession())?.accessToken;
}

/** `GET /whatsapp/connection` (`whatsapp.manage_connection` is not required for Inbox read). */
export async function getWhatsAppConnection(): Promise<WhatsAppConnectionDto> {
  const response = await apiRequest<WhatsAppConnectionDto>(`${WHATSAPP_PATH}/connection`);
  return response.data;
}

/** `GET /whatsapp/conversations` (`whatsapp.read`). */
export async function listWhatsAppConversations(
  params: WhatsAppListQuery,
): Promise<{ data: WhatsAppConversationListItemDto[]; meta: WhatsAppPageMeta | null }> {
  const query = buildWhatsAppConversationQuery(params);
  const response = await apiRequest<WhatsAppConversationListItemDto[]>(
    `${WHATSAPP_PATH}/conversations?${query}`,
  );
  return { data: response.data, meta: parseWhatsAppPageMeta(response.meta) };
}

/** `GET /whatsapp/conversations/:id` (`whatsapp.read`). */
export async function getWhatsAppConversation(
  id: string,
): Promise<WhatsAppConversationDetailDto> {
  const response = await apiRequest<WhatsAppConversationDetailDto>(
    `${WHATSAPP_PATH}/conversations/${id}`,
  );
  return response.data;
}

/** `GET /whatsapp/conversations/:id/messages` (`whatsapp.read`). Newest-first. */
export async function listWhatsAppMessages(
  conversationId: string,
  params: WhatsAppMessageQuery,
): Promise<{ data: WhatsAppMessageDto[]; meta: WhatsAppPageMeta | null }> {
  const search = new URLSearchParams();
  search.set("page", String(params.page || 1));
  search.set("pageSize", String(params.pageSize || WHATSAPP_MESSAGE_PAGE_SIZE));
  const response = await apiRequest<WhatsAppMessageDto[]>(
    `${WHATSAPP_PATH}/conversations/${conversationId}/messages?${search.toString()}`,
  );
  return { data: response.data, meta: parseWhatsAppPageMeta(response.meta) };
}

/**
 * `POST /whatsapp/conversations/:id/read` (`whatsapp.read`).
 * Diamond staff unread only — not a Meta provider receipt.
 */
export async function markWhatsAppConversationRead(
  id: string,
): Promise<WhatsAppConversationDetailDto> {
  const response = await apiRequest<WhatsAppConversationDetailDto>(
    `${WHATSAPP_PATH}/conversations/${id}/read`,
    { method: "POST" },
  );
  return response.data;
}

/**
 * `POST /whatsapp/conversations/:id/messages` (`whatsapp.send`).
 * Manual text only. Recipient is derived server-side.
 */
export async function sendWhatsAppTextMessage(
  conversationId: string,
  text: string,
  idempotencyKey: string,
): Promise<WhatsAppSendResult> {
  const response = await apiRequest<WhatsAppSendResult>(
    `${WHATSAPP_PATH}/conversations/${conversationId}/messages`,
    {
      method: "POST",
      body: { text },
      headers: { "Idempotency-Key": idempotencyKey },
    },
  );
  return response.data;
}

export async function listWhatsAppTemplates(): Promise<WhatsAppTemplateDto[]> {
  const response = await apiRequest<WhatsAppTemplateDto[]>(`${WHATSAPP_PATH}/templates`);
  return response.data;
}

export async function sendWhatsAppTemplateMessage(
  conversationId: string,
  input: {
    name: string;
    language: string;
    headerParameters?: string[];
    bodyParameters?: string[];
  },
  idempotencyKey: string,
): Promise<WhatsAppSendResult> {
  const response = await apiRequest<WhatsAppSendResult>(
    `${WHATSAPP_PATH}/conversations/${conversationId}/template-messages`,
    {
      method: "POST",
      body: input,
      headers: { "Idempotency-Key": idempotencyKey },
    },
  );
  return response.data;
}

export async function sendWhatsAppMediaMessage(
  conversationId: string,
  input: { file: File; messageType: string; caption?: string },
  idempotencyKey: string,
): Promise<WhatsAppSendResult> {
  const token = await accessToken();
  const form = new FormData();
  form.append("file", input.file);
  form.append("messageType", input.messageType);
  if (input.caption) form.append("caption", input.caption);
  const response = await fetch(
    `${env.apiUrl}${WHATSAPP_PATH}/conversations/${conversationId}/media-messages`,
    {
      method: "POST",
      credentials: "include",
      headers: {
        Accept: "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        "Idempotency-Key": idempotencyKey,
      },
      body: form,
    },
  );
  const payload = (await response.json()) as {
    data?: WhatsAppSendResult;
    error?: { code: string; message: string; context?: Record<string, unknown> };
  };
  if (!response.ok || !payload.data) {
    const { ApiRequestError } = await import("@/infrastructure/api/errors");
    throw new ApiRequestError(
      payload.error ?? { code: `HTTP_${response.status}`, message: response.statusText },
      response.status,
    );
  }
  return payload.data;
}

export async function fetchWhatsAppMediaObjectUrl(messageId: string): Promise<string> {
  const token = await accessToken();
  const response = await fetch(`${env.apiUrl}${WHATSAPP_PATH}/messages/${messageId}/media`, {
    credentials: "include",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!response.ok) {
    const { ApiRequestError } = await import("@/infrastructure/api/errors");
    throw new ApiRequestError(
      { code: `HTTP_${response.status}`, message: "Media unavailable" },
      response.status,
    );
  }
  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

export async function getWhatsAppCustomerMatch(
  conversationId: string,
): Promise<WhatsAppCustomerMatchDto> {
  const response = await apiRequest<WhatsAppCustomerMatchDto>(
    `${WHATSAPP_PATH}/conversations/${conversationId}/customer-match`,
  );
  return response.data;
}

export async function linkWhatsAppCustomer(
  conversationId: string,
  customerId: number,
): Promise<WhatsAppConversationDetailDto> {
  const response = await apiRequest<WhatsAppConversationDetailDto>(
    `${WHATSAPP_PATH}/conversations/${conversationId}/customer-link`,
    { method: "POST", body: { customerId } },
  );
  return response.data;
}

export async function unlinkWhatsAppCustomer(
  conversationId: string,
): Promise<WhatsAppConversationDetailDto> {
  const response = await apiRequest<WhatsAppConversationDetailDto>(
    `${WHATSAPP_PATH}/conversations/${conversationId}/customer-link`,
    { method: "DELETE" },
  );
  return response.data;
}

export async function searchDiamondCustomers(
  search: string,
): Promise<WhatsAppLinkedCustomerDto[]> {
  const query = new URLSearchParams({ page: "1", pageSize: "10" });
  if (search.trim()) query.set("search", search.trim());
  const response = await apiRequest<WhatsAppLinkedCustomerDto[]>(`/customers?${query.toString()}`);
  return response.data.map((row) => ({
    id: row.id,
    name: row.name,
    mobile: row.mobile ?? null,
    externalId: row.externalId ?? null,
  }));
}

export async function startWhatsAppConnectionAttempt(): Promise<WhatsAppConnectionAttemptStartDto> {
  const response = await apiRequest<WhatsAppConnectionAttemptStartDto>(
    `${WHATSAPP_PATH}/connection/attempts`,
    { method: "POST" },
  );
  return response.data;
}

export async function authorizeWhatsAppConnectionAttempt(
  attemptId: string,
  authorizationCode: string,
  state: string,
): Promise<{ attemptId: string; choices: WhatsAppGrantedChoiceDto[] }> {
  const response = await apiRequest<{ attemptId: string; choices: WhatsAppGrantedChoiceDto[] }>(
    `${WHATSAPP_PATH}/connection/attempts/${attemptId}/authorize`,
    { method: "POST", body: { authorizationCode, state } },
  );
  return response.data;
}

export async function selectWhatsAppConnection(
  attemptId: string,
  wabaId: string,
  phoneNumberId: string,
): Promise<WhatsAppConnectionDto> {
  const response = await apiRequest<WhatsAppConnectionDto>(
    `${WHATSAPP_PATH}/connection/attempts/${attemptId}/select`,
    { method: "POST", body: { wabaId, phoneNumberId } },
  );
  return response.data;
}

export async function disconnectWhatsAppConnection(): Promise<WhatsAppConnectionDto> {
  const response = await apiRequest<WhatsAppConnectionDto>(
    `${WHATSAPP_PATH}/connection/disconnect`,
    { method: "POST" },
  );
  return response.data;
}

export async function activateWhatsAppWebhook(): Promise<WhatsAppConnectionDto> {
  const response = await apiRequest<WhatsAppConnectionDto>(
    `${WHATSAPP_PATH}/connection/webhook/activate`,
    { method: "POST" },
  );
  return response.data;
}

export async function bootstrapWhatsAppConnection(): Promise<WhatsAppConnectionDto> {
  const response = await apiRequest<WhatsAppConnectionDto>(
    `${WHATSAPP_PATH}/connection/bootstrap`,
    { method: "POST" },
  );
  return response.data;
}

export async function getWhatsAppConnectionQr(): Promise<{ imageDataUrl: string | null; qrCode: string | null }> {
  const response = await apiRequest<{ imageDataUrl: string | null; qrCode: string | null }>(
    `${WHATSAPP_PATH}/connection/qr`,
  );
  return response.data;
}
