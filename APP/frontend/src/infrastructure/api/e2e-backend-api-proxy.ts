export type E2eProxyRequest = {
  method: string;
  pathSegments: string[];
  search: string;
  headers: Headers;
  body?: ArrayBuffer;
};

export type E2eProxyResponse = {
  status: number;
  statusText: string;
  headers: Headers;
  body: ArrayBuffer;
};

export function isE2eStaffApiProxyEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (env.RBAC_E2E_API_PROXY !== "true") return false;
  const port = env.RBAC_E2E_API_PORT?.trim();
  return Boolean(port && /^\d{2,5}$/.test(port));
}

export function resolveE2eBackendOrigin(env: NodeJS.ProcessEnv = process.env): string | null {
  if (!isE2eStaffApiProxyEnabled(env)) return null;
  const port = env.RBAC_E2E_API_PORT!.trim();
  return `http://127.0.0.1:${port}`;
}

/** E2E port wins; else staging/docker same-origin proxy uses internal NEXT_PUBLIC_API_URL. */
export function resolveStaffApiProxyUpstream(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const e2eOrigin = resolveE2eBackendOrigin(env);
  if (e2eOrigin) return e2eOrigin;
  if (env.NEXT_PUBLIC_API_PROXY !== "true") return null;
  const url = env.NEXT_PUBLIC_API_URL?.trim();
  if (!url) return null;
  return url.replace(/\/$/, "");
}

export function isSafeBackendPath(pathSegments: string[]): boolean {
  if (pathSegments.length === 0) return false;
  return pathSegments.every(
    (segment) =>
      segment.length > 0 &&
      !segment.includes("..") &&
      !segment.includes("\\") &&
      !/^https?:$/i.test(segment),
  );
}

export function pickUpstreamRequestHeaders(incoming: Headers): Headers {
  const headers = new Headers();
  const authorization = incoming.get("authorization");
  if (authorization) headers.set("authorization", authorization);
  const accept = incoming.get("accept");
  if (accept) headers.set("accept", accept);
  const contentType = incoming.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  const acceptLanguage = incoming.get("accept-language");
  if (acceptLanguage) headers.set("accept-language", acceptLanguage);
  return headers;
}

export function e2eProxyDisabledResponse(): E2eProxyResponse {
  const body = new TextEncoder().encode(
    JSON.stringify({ error: { code: "NOT_FOUND", message: "Not found" } }),
  );
  return {
    status: 404,
    statusText: "Not Found",
    headers: new Headers({ "content-type": "application/json" }),
    body: body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
  };
}

export async function proxyE2eStaffApiRequest(
  request: E2eProxyRequest,
  fetchImpl: typeof fetch = fetch,
  env: NodeJS.ProcessEnv = process.env,
): Promise<E2eProxyResponse> {
  const origin = resolveStaffApiProxyUpstream(env);
  if (!origin || !isSafeBackendPath(request.pathSegments)) {
    return e2eProxyDisabledResponse();
  }

  const path = request.pathSegments.join("/");
  const target = `${origin}/${path}${request.search}`;

  const init: RequestInit = {
    method: request.method,
    headers: request.headers,
    redirect: "manual",
  };
  if (request.method !== "GET" && request.method !== "HEAD" && request.body) {
    init.body = request.body;
  }

  const upstream = await fetchImpl(target, init);
  const responseHeaders = new Headers(upstream.headers);
  responseHeaders.delete("transfer-encoding");
  // Node fetch decompresses gzip/deflate bodies but may keep Content-Encoding /
  // Content-Length from upstream — browsers would mis-decode the plain body.
  responseHeaders.delete("content-encoding");
  responseHeaders.delete("content-length");
  const body = await upstream.arrayBuffer();

  return {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
    body,
  };
}
