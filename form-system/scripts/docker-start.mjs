import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";

process.env.HOSTNAME = process.env.APP_HOST ?? process.env.HOSTNAME ?? "0.0.0.0";
process.env.PORT = process.env.PORT ?? "3000";

if (process.env.SKIP_DB_MIGRATE !== "true") {
  const require = createRequire(import.meta.url);
  let prismaCli;
  try {
    prismaCli = require.resolve("prisma/build/index.js");
  } catch {
    console.error("Prisma CLI not found; cannot run migrations.");
    process.exit(1);
  }
  const schema = existsSync("prisma/schema.prisma")
    ? "prisma/schema.prisma"
    : undefined;
  const args = ["migrate", "deploy"];
  if (schema) args.push("--schema", schema);
  console.log("Running database migrations…");
  const r = spawnSync(process.execPath, [prismaCli, ...args], {
    stdio: "inherit",
    env: process.env,
  });
  if ((r.status ?? 1) !== 0) {
    console.error("Migration failed.");
    process.exit(r.status ?? 1);
  }
}

const server = existsSync("server.js")
  ? "./server.js"
  : "./.next/standalone/server.js";
await import(server);
