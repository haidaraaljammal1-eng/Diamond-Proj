/**
 * A send that already copied a credential must not leave after the office
 * connection was suspended or replaced.
 */
export function outboundCredentialStillCurrent(
  row: {
    provider: string;
    status: string;
    providerSessionStatus: string | null;
    credentialCiphertext: string | null;
  } | null,
  reservedCiphertext: string,
): boolean {
  if (!reservedCiphertext || !row) return false;
  if (row.status !== "LINKED") return false;
  if (row.credentialCiphertext !== reservedCiphertext) return false;
  if (row.provider === "WHAPI" || row.provider === "ULTRAMSG") {
    return row.providerSessionStatus === "AUTHENTICATED";
  }
  return true;
}
