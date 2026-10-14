import dotenv from "dotenv";
import path from "node:path";
import { assertTestDatabaseUrl } from "../tests/helpers/integration-harness";

dotenv.config({ path: path.resolve(__dirname, "../.env") });
const devUrl = process.env.DATABASE_URL ?? "";
const testUrl = devUrl.replace(/\/([^/?]+)(\?|$)/, "/haidara_test$2");
assertTestDatabaseUrl(testUrl);
process.stdout.write(testUrl);
