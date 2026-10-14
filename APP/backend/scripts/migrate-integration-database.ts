import dotenv from "dotenv";
import path from "node:path";
import { execSync } from "node:child_process";
import { assertTestDatabaseUrl } from "../tests/helpers/integration-harness";

dotenv.config({ path: path.resolve(__dirname, "../.env") });
const devUrl = process.env.DATABASE_URL ?? "";
const testUrl = devUrl.replace(/\/([^/?]+)(\?|$)/, "/haidara_test$2");
assertTestDatabaseUrl(testUrl);
process.env.DATABASE_URL = testUrl;
process.env.TEST_DATABASE_URL = testUrl;
execSync("npx prisma migrate deploy", { stdio: "inherit", env: process.env });
