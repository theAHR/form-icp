import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

process.env.HOSTNAME = process.env.APP_HOST ?? process.env.HOSTNAME ?? "0.0.0.0";
process.env.PORT = process.env.PORT ?? "3000";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptsDir, "..");
const backupDaemon = spawn(
  process.execPath,
  [
    "--env-file-if-exists=.env",
    path.join(scriptsDir, "backup-members.mjs"),
    "daemon",
  ],
  {
    cwd: root,
    detached: true,
    stdio: "ignore",
    windowsHide: true,
    env: process.env,
  },
);
backupDaemon.unref();

await import("../.next/standalone/server.js");
