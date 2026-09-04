process.env.OPENAPI_EXPORT = "true";

import { writeFile } from "node:fs/promises";
import { buildApp } from "src/app";

/** Export the OpenAPI document (contract source of truth) to openapi.json. */
async function main() {
  const app = await buildApp();
  const document = app.swagger();
  await writeFile("openapi.json", JSON.stringify(document, null, 2));
  await app.close();

  console.log("Wrote openapi.json");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
