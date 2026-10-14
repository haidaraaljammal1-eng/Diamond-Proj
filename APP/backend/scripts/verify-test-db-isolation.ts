/**
 * Prints redacted dev vs integration database identity for safety gates.
 * Does not print credentials.
 */
import dotenv from "dotenv";
import path from "node:path";
import {
  assertTestDatabaseUrl,
  extractPostgresDatabaseName,
} from "../tests/helpers/integration-harness";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const devUrl = process.env.DATABASE_URL ?? "";
if (!devUrl) {
  console.error("DATABASE_URL missing from .env");
  process.exit(1);
}

const devDb = extractPostgresDatabaseName(devUrl);
const testUrl = devUrl.replace(/\/([^/?]+)(\?|$)/, "/haidara_test$2");
assertTestDatabaseUrl(testUrl);
const testDb = extractPostgresDatabaseName(testUrl);

function parseHostPortUser(url: string) {
  const normalized = url.replace(/^postgresql:/, "http:").replace(/^postgres:/, "http:");
  const parsed = new URL(normalized);
  return {
    host: parsed.hostname,
    port: parsed.port || "5432",
    user: decodeURIComponent(parsed.username),
  };
}

const devConn = parseHostPortUser(devUrl);
const testConn = parseHostPortUser(testUrl);

const report = {
  developmentDatabase: devDb,
  integrationDatabase: testDb,
  databasesDistinct: devDb !== testDb,
  integrationNameExact: testDb === "haidara_test",
  developmentHost: devConn.host,
  integrationHost: testConn.host,
  sameServer: devConn.host === testConn.host && devConn.port === testConn.port,
  developmentUser: devConn.user,
  integrationUser: testConn.user,
};

console.log(JSON.stringify(report, null, 2));

if (!report.databasesDistinct || !report.integrationNameExact) {
  process.exit(2);
}
