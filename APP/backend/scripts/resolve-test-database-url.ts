import { env } from "src/config/env";

const explicit = process.env.TEST_DATABASE_URL?.trim();
const derived = env.DATABASE_URL.replace(/\/diamond(\?|$)/, "/haidara_test$1");
const testUrl = explicit || derived;

if (!/\/haidara_test(?:\?|$)/.test(testUrl)) {
  console.error("TEST_DATABASE_URL must point at haidara_test");
  process.exit(1);
}

process.stdout.write(testUrl);
