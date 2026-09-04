import { buildApp } from "src/app";
import { env } from "src/config/env";

async function main() {
  const app = await buildApp();

  const shutdown = (signal: string) => {
    app.log.info({ signal }, "shutting down");
    void app.close().then(() => process.exit(0));
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  try {
    // Always bind all interfaces (0.0.0.0). In a container the platform's
    // port-forward / reverse-proxy reaches the app on the container's external
    // interface; binding loopback (127.0.0.1) makes the app reachable ONLY from
    // inside the container → external health checks get "connection reset by
    // peer" → the deploy is rolled back. Mirrors the working
    // backend-school-system, which hardcodes 0.0.0.0 and has no HOST knob.
    await app.listen({ port: env.PORT, host: "0.0.0.0" });
  } catch (err) {
    app.log.error(err, "failed to start server");
    process.exit(1);
  }
}

void main();
