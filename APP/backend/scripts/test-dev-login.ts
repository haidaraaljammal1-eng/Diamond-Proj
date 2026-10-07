import dotenv from "dotenv";
import path from "node:path";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

async function main(): Promise<void> {
  const email = process.env.DEV_ADMIN_EMAIL;
  const password = process.env.DEV_ADMIN_PASSWORD;
  if (!email || !password) {
    console.error("DEV_ADMIN_EMAIL / DEV_ADMIN_PASSWORD missing");
    process.exit(1);
  }
  const response = await fetch("http://localhost:8000/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const payload = (await response.json()) as { data?: { accessToken?: string } };
  console.log(
    JSON.stringify({
      status: response.status,
      loginOk: response.ok && Boolean(payload.data?.accessToken),
    }),
  );
  if (!response.ok) process.exit(1);
}

void main();
