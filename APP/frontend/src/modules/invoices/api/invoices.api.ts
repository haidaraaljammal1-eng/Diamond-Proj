import { env } from "@/config/env";
import { apiRequest } from "@/infrastructure/api/client";
import { ApiRequestError } from "@/infrastructure/api/errors";
import type { ApiErrorResponse } from "@/infrastructure/api/types";
import type {
  InvoiceDeliveryDto,
  InvoiceDetailDto,
  InvoiceListItemDto,
  InvoicePageMeta,
  InvoicePdfDownload,
  InvoicesListQuery,
} from "../types/invoices.types";
import { INVOICES_PAGE_SIZE } from "../types/invoices.types";
import { buildInvoicesQuery } from "../utils/invoice-filters";

const INVOICES_PATH = "/invoices";

async function getAccessToken(): Promise<string | undefined> {
  if (typeof window === "undefined") return undefined;
  const { getSession } = await import("next-auth/react");
  return (await getSession())?.accessToken;
}

function isApiErrorResponse(value: unknown): value is ApiErrorResponse {
  if (typeof value !== "object" || value === null || !("error" in value)) return false;
  const error = value.error;
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    "message" in error
  );
}

function parseContentDispositionFilename(header: string | null): string | null {
  if (!header) return null;
  const utfMatch = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (utfMatch?.[1]) return decodeURIComponent(utfMatch[1].replace(/"/g, ""));
  const plainMatch = /filename="?([^";]+)"?/i.exec(header);
  return plainMatch?.[1] ?? null;
}

export function parseInvoicePageMeta(meta: unknown): InvoicePageMeta | null {
  if (typeof meta !== "object" || meta === null) return null;
  const candidate = meta as Record<string, unknown>;
  const isNumber = (value: unknown): value is number =>
    typeof value === "number" && Number.isFinite(value);

  if (
    !isNumber(candidate.page) ||
    !isNumber(candidate.pageSize) ||
    !isNumber(candidate.total) ||
    !isNumber(candidate.totalPages)
  ) {
    return null;
  }

  return {
    page: candidate.page,
    pageSize: candidate.pageSize,
    total: candidate.total,
    totalPages: candidate.totalPages,
  };
}

/** `GET /invoices` (Backend permission: `invoices.read`). */
export async function listInvoices(
  params: InvoicesListQuery,
): Promise<{ data: InvoiceListItemDto[]; meta: InvoicePageMeta | null }> {
  const query = buildInvoicesQuery({
    ...params,
    pageSize: params.pageSize ?? INVOICES_PAGE_SIZE,
  });
  const response = await apiRequest<InvoiceListItemDto[]>(`${INVOICES_PATH}?${query}`);
  return { data: response.data, meta: parseInvoicePageMeta(response.meta) };
}

/** `GET /invoices/:id` (Backend permission: `invoices.read`). */
export async function getInvoice(id: string): Promise<InvoiceDetailDto> {
  const response = await apiRequest<InvoiceDetailDto>(`${INVOICES_PATH}/${id}`);
  return response.data;
}

/** `GET /invoices/:id/deliveries` (Backend permission: `invoices.read`). */
export async function getInvoiceDeliveries(id: string): Promise<InvoiceDeliveryDto[]> {
  const response = await apiRequest<InvoiceDeliveryDto[]>(`${INVOICES_PATH}/${id}/deliveries`);
  return response.data;
}

/** `GET /invoices/:id/pdf` — official backend PDF. */
export async function downloadInvoicePdf(
  id: string,
  options: { download?: boolean } = {},
): Promise<InvoicePdfDownload> {
  const accessToken = await getAccessToken();
  const suffix = options.download ? "?download=1" : "";
  const response = await fetch(`${env.apiUrl}${INVOICES_PATH}/${id}/pdf${suffix}`, {
    method: "GET",
    credentials: "include",
    headers: {
      Accept: "application/pdf",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
  });

  if (!response.ok) {
    const json = await response.json().catch(() => undefined);
    if (isApiErrorResponse(json)) {
      throw new ApiRequestError(json.error, response.status);
    }
    throw new ApiRequestError(
      { code: "NETWORK_ERROR", message: `PDF request failed (${response.status})` },
      response.status,
    );
  }

  const blob = await response.blob();
  const filename =
    parseContentDispositionFilename(response.headers.get("Content-Disposition")) ??
    `invoice-${id}.pdf`;
  return { blob, filename };
}

/** `POST /invoices/:id/deliveries/whatsapp` (Backend permission: `invoices.send_whatsapp`). */
export async function sendInvoiceWhatsApp(
  id: string,
  idempotencyKey?: string,
): Promise<InvoiceDeliveryDto> {
  const response = await apiRequest<InvoiceDeliveryDto>(
    `${INVOICES_PATH}/${id}/deliveries/whatsapp`,
    {
      method: "POST",
      body: idempotencyKey ? { idempotencyKey } : {},
      headers: idempotencyKey ? { "idempotency-key": idempotencyKey } : undefined,
    },
  );
  return response.data;
}

/** Opens official PDF in a new tab; revokes blob URL after load. */
export async function openInvoicePdfInNewTab(id: string): Promise<void> {
  const { blob } = await downloadInvoicePdf(id, { download: false });
  const url = URL.createObjectURL(blob);
  const tab = window.open(url, "_blank", "noopener,noreferrer");
  if (!tab) {
    URL.revokeObjectURL(url);
    throw new Error("POPUP_BLOCKED");
  }
  tab.addEventListener("load", () => {
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  });
}

export async function triggerInvoicePdfDownload(id: string): Promise<void> {
  const { blob, filename } = await downloadInvoicePdf(id, { download: true });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
