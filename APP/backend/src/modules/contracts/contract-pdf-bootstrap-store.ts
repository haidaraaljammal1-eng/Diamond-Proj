import { randomUUID } from "node:crypto";
import type { OfficialContractView } from "src/modules/contracts/contracts.schema";

export type ContractPdfRenderBootstrap = {
  contract: OfficialContractView;
  signatureImages: Record<string, string | undefined>;
};

const TTL_MS = 120_000;
const store = new Map<string, { payload: ContractPdfRenderBootstrap; expiresAt: number }>();

function purgeExpired(): void {
  const now = Date.now();
  for (const [key, row] of store) {
    if (row.expiresAt <= now) store.delete(key);
  }
}

export function issueContractPdfBootstrapToken(payload: ContractPdfRenderBootstrap): string {
  purgeExpired();
  const token = randomUUID();
  store.set(token, { payload, expiresAt: Date.now() + TTL_MS });
  return token;
}

export function consumeContractPdfBootstrapToken(token: string): ContractPdfRenderBootstrap | null {
  purgeExpired();
  const row = store.get(token);
  if (!row || row.expiresAt <= Date.now()) {
    store.delete(token);
    return null;
  }
  store.delete(token);
  return row.payload;
}
