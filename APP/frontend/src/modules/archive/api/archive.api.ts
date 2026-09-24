import { env } from "@/config/env";
import { apiRequest } from "@/infrastructure/api/client";
import { ApiRequestError } from "@/infrastructure/api/errors";
import type { ApiErrorResponse } from "@/infrastructure/api/types";
import type { ArchiveRow, ArchiveRowPatch, ArchiveVehicle } from "../types/archive.types";

const ARCHIVE_PATH = "/archive";

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

export interface ArchiveExportDownload {
  blob: Blob;
  filename: string;
}

export async function listArchiveVehicles(): Promise<ArchiveVehicle[]> {
  const response = await apiRequest<ArchiveVehicle[]>(`${ARCHIVE_PATH}/vehicles`);
  return response.data;
}

export async function listArchiveRows(vehicleId: number): Promise<ArchiveRow[]> {
  const response = await apiRequest<ArchiveRow[]>(
    `${ARCHIVE_PATH}/vehicles/${vehicleId}/rows`,
  );
  return response.data;
}

export async function createArchiveRow(
  vehicleId: number,
  body: ArchiveRowPatch = {},
): Promise<ArchiveRow> {
  const response = await apiRequest<ArchiveRow>(
    `${ARCHIVE_PATH}/vehicles/${vehicleId}/rows`,
    { method: "POST", body },
  );
  return response.data;
}

export async function updateArchiveRow(
  rowId: number,
  patch: ArchiveRowPatch,
): Promise<ArchiveRow> {
  const response = await apiRequest<ArchiveRow>(`${ARCHIVE_PATH}/rows/${rowId}`, {
    method: "PATCH",
    body: patch,
  });
  return response.data;
}

export async function deleteArchiveRow(rowId: number): Promise<void> {
  await apiRequest<void>(`${ARCHIVE_PATH}/rows/${rowId}`, { method: "DELETE" });
}

export async function downloadArchiveExport(): Promise<ArchiveExportDownload> {
  const accessToken = await getAccessToken();
  const response = await fetch(`${env.apiUrl}${ARCHIVE_PATH}/export`, {
    method: "GET",
    headers: {
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    credentials: "include",
  });

  if (!response.ok) {
    const text = await response.text();
    let payload: unknown;
    try {
      payload = text ? JSON.parse(text) : undefined;
    } catch {
      payload = undefined;
    }
    if (isApiErrorResponse(payload)) {
      throw new ApiRequestError(payload.error, response.status);
    }
    throw new ApiRequestError(
      {
        code: `HTTP_${response.status}`,
        message: response.statusText || "Archive export failed",
      },
      response.status,
    );
  }

  const blob = await response.blob();
  const filename =
    parseContentDispositionFilename(response.headers.get("content-disposition")) ??
    "Diamond_Archive.xlsx";
  return { blob, filename };
}
