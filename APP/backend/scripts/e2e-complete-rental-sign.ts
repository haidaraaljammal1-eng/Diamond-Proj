/**
 * Completes official contract review + signatures + sign for Playwright E2E.
 * Usage: npx tsx scripts/e2e-complete-rental-sign.ts --token=<rentalToken>
 */
import "./e2e-script-env";
import { buildApp } from "src/app";
import { imageMultipart, TEST_PNG } from "tests/helpers/public-identity";

function arg(name: string): string | undefined {
  return process.argv.find((entry) => entry.startsWith(`--${name}=`))?.split("=")[1];
}

function contractUrl(token: string, suffix = ""): string {
  return `/contracts/rental/${token}/official-contract${suffix}`;
}

async function main() {
  const token = arg("token");
  if (!token) throw new Error("Pass --token=<rentalToken>");

  const app = await buildApp();
  const get = () => app.inject({ method: "GET", url: contractUrl(token) });
  const patch = (payload: Record<string, unknown>) =>
    app.inject({ method: "PATCH", url: contractUrl(token), payload });
  const submitReview = () =>
    app.inject({ method: "POST", url: contractUrl(token, "/review/submit") });
  const sign = () => app.inject({ method: "POST", url: contractUrl(token, "/sign"), payload: {} });
  const putSignature = (slot: string) => {
    const file = imageMultipart(`${slot}.png`, "image/png", TEST_PNG);
    return app.inject({
      method: "PUT",
      url: contractUrl(token, `/signatures/${slot}`),
      headers: file.headers,
      payload: file.payload,
    });
  };

  type ContractView = {
    permissions: { signableSlots: string[]; missingRequirements: string[] };
    contract: { status: string };
  };

  let view: ContractView | null = null;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const loaded = await get();
    if (loaded.statusCode === 200) {
      const data = loaded.json().data as ContractView | undefined;
      if (data?.contract) {
        view = data;
        break;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 1_500));
  }
  if (!view?.contract) {
    throw new Error("Contract not ready for API signing after identity simulation");
  }

  if (view.contract.status === "AWAITING") {
    const reviewed = await submitReview();
    if (reviewed.statusCode !== 200) {
      throw new Error(`Review submit failed (${reviewed.statusCode}): ${reviewed.body}`);
    }
    view = reviewed.json().data;
  }

  const patchBody: Record<string, string> = {};
  if (view.permissions.missingRequirements.includes("TELEPHONE")) {
    patchBody.telephone = "+971500000099";
  }
  if (view.permissions.missingRequirements.includes("ADDRESS")) {
    patchBody.address = "Dubai Marina";
  }
  if (Object.keys(patchBody).length > 0) {
    const patched = await patch(patchBody);
    if (patched.statusCode !== 200) {
      throw new Error(`Review patch failed (${patched.statusCode}): ${patched.body}`);
    }
    view = patched.json().data;
  }

  for (const slot of view.permissions.signableSlots) {
    const path = slot === "HIRER" ? "hirer" : slot === "ADDITIONAL_DRIVER" ? "additional-driver" : "sponsor";
    const saved = await putSignature(path);
    if (saved.statusCode !== 200) {
      throw new Error(`Signature ${path} failed (${saved.statusCode}): ${saved.body}`);
    }
  }

  const signed = await sign();
  if (signed.statusCode !== 200) {
    throw new Error(`Sign failed (${signed.statusCode}): ${signed.body}`);
  }

  console.log(
    `E2E_RENTAL_SIGN_JSON=${JSON.stringify({
      status: signed.json().data.contract.status,
      collectionMode: signed.json().data.contract.collectionMode ?? null,
    })}`,
  );
  await app.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
