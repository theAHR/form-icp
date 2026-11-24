import { writeFile, access } from "node:fs/promises";
import { randomBytes } from "node:crypto";
try {
  await access(".env");
  console.error(
    ".env already exists. Edit it deliberately; this script never overwrites credentials.",
  );
  process.exit(1);
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
const database = randomBytes(24).toString("hex");
const admin = "A!" + randomBytes(18).toString("base64url") + "9";
const content = `DATABASE_URL=postgresql://membership:${database}@localhost:5432/membership?schema=public
POSTGRES_PASSWORD=${database}
AUTH_SECRET=${randomBytes(32).toString("hex")}
APP_URL=http://localhost:3000
COOKIE_SECURE=false
STORAGE_PATH=./storage
SEED_ADMIN_PASSWORD=${admin}
ALLOW_DEV_SEED=false
TRUST_PROXY=false
`;
await writeFile(".env", content, { mode: 0o600, flag: "wx" });
console.log(
  "Created .env with random secrets. Read SEED_ADMIN_PASSWORD locally for the initial admin password; do not share this file.",
);
