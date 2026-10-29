import { mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildApp } from "./app.js";

try {
  process.loadEnvFile(fileURLToPath(new URL("../.env.local", import.meta.url)));
} catch {
  // .env.local is optional; credentials may come from the process environment.
}

const port = Number(process.env.COVE_PORT ?? 4317);
const dataDir = process.env.COVE_DATA_DIR ?? path.join(os.homedir(), "Library", "Application Support", "Cove");
mkdirSync(dataDir, { recursive: true });

const app = buildApp({
  dbPath: process.env.COVE_DB_PATH ?? path.join(dataDir, "cove.sqlite"),
  logger: true,
  autoSync: process.env.COVE_AUTO_SYNC !== "0",
  staticDir: process.env.COVE_STATIC_DIR ?? path.resolve(process.cwd(), "../webapp/dist"),
  google:
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? {
          clientId: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          redirectUri: process.env.GOOGLE_REDIRECT_URI ?? "http://127.0.0.1:4317/oauth/google/callback",
        }
      : null,
});

try {
  await app.listen({ host: "127.0.0.1", port });
  app.log.info(`Cove local service listening on http://127.0.0.1:${port}`);
} catch (error) {
  app.log.error(error);
  process.exit(1);
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void app.close().then(() => process.exit(0));
  });
}
