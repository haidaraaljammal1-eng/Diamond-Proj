import { type NextRequest, NextResponse } from "next/server";
import {
  pickUpstreamRequestHeaders,
  proxyE2eStaffApiRequest,
} from "@/infrastructure/api/e2e-backend-api-proxy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ path: string[] }> };

async function handle(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  const body =
    request.method !== "GET" && request.method !== "HEAD"
      ? await request.arrayBuffer()
      : undefined;

  const result = await proxyE2eStaffApiRequest({
    method: request.method,
    pathSegments: path,
    search: request.nextUrl.search,
    headers: pickUpstreamRequestHeaders(request.headers),
    body,
  });

  return new NextResponse(result.body, {
    status: result.status,
    statusText: result.statusText,
    headers: result.headers,
  });
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const HEAD = handle;
export const OPTIONS = handle;
