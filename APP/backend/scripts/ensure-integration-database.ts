/**
 * Creates `haidara_test` on the same server as DATABASE_URL if missing.
 * Never drops or truncates any database.
 */
import dotenv from "dotenv";
import path from "node:path";
import pg from "pg";
import {
  assertTestDatabaseUrl,
  extractPostgresDatabaseName,
} from "../tests/helpers/integration-harness";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const devUrl = process.env.DATABASE_URL ?? "";
const testUrl = devUrl.replace(/\/([^/?]+)(\?|$)/, "/haidara_test$2");
assertTestDatabaseUrl(testUrl);

const adminUrl = devUrl.replace(/\/([^/?]+)(\?|$)/, "/postgres$2");
const testDb = extractPostgresDatabaseName(testUrl);

async function main() {
  const client = new pg.Client({ connectionString: adminUrl });
  await client.connect();
  const exists = await client.query(
    "SELECT 1 FROM pg_database WHERE datname = $1",
    [testDb],
  );
  if (exists.rowCount === 0) {
    if (testDb !== "haidara_test") {
      throw new Error("Refusing to create non-haidara_test database");
    }
    await client.query("CREATE DATABASE haidara_test");
    console.log(`Created database ${testDb}`);
  } else {
    console.log(`Database ${testDb} already exists`);
  }
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
