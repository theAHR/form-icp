import { createHmac, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { db } from "./db";
import { AppError, check } from "./errors";
import { hasPermission } from "./permissions";
export type Actor = {
  id: string;
  username: string;
  displayName: string;
  roles: string[];
  permissions: string[];
  mustChangePassword: boolean;
};
export const cookieName = "ICP_session";
export function hashToken(s: string) {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32 || secret.startsWith("REPLACE_"))
    throw new Error(
      "AUTH_SECRET must be a random secret of at least 32 characters",
    );
  return createHmac("sha256", secret).update(s).digest("hex");
}
export const token = () => randomBytes(32).toString("base64url");
export function cookie(req: Request, name: string) {
  return req.headers
    .get("cookie")
    ?.split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(name + "="))
    ?.slice(name.length + 1);
}
export function cookieHeader(name: string, value: string, age: number) {
  return `${name}=${value}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${age}${process.env.COOKIE_SECURE === "true" ? "; Secure" : ""}`;
}
export function ip(req: Request) {
  return process.env.TRUST_PROXY === "true"
    ? (req.headers.get("x-forwarded-for")?.split(",")[0]?.trim().slice(0, 64) ??
        "unknown")
    : "direct";
}
export function sameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  let originHost: string | undefined;
  try {
    originHost = origin ? new URL(origin).host : undefined;
  } catch {}
  check(
    origin ===
      new URL(process.env.APP_URL ?? "http://localhost:3000").origin ||
      (!!host && originHost === host),
    403,
    "مبدأ درخواست مجاز نیست.",
  );
}
export async function limit(key: string, max: number, seconds: number) {
  const now = new Date();
  const reset = new Date(now.getTime() + seconds * 1000);
  const rows = await db.$queryRaw<
    { count: number }[]
  >`INSERT INTO "RateLimit" (key,count,"resetAt") VALUES (${key},1,${reset}) ON CONFLICT (key) DO UPDATE SET count=CASE WHEN "RateLimit"."resetAt" < ${now} THEN 1 ELSE "RateLimit".count+1 END, "resetAt"=CASE WHEN "RateLimit"."resetAt" < ${now} THEN ${reset} ELSE "RateLimit"."resetAt" END RETURNING count`;
  check(
    Number(rows[0].count) <= max,
    429,
    "تعداد درخواست‌ها زیاد است. کمی بعد تلاش کنید.",
  );
}

/** پاکسازی دوره‌ای کلیدهای منقضی rate-limit برای جلوگیری از رشد جدول */
export async function sweepRateLimits() {
  await db.$executeRaw`DELETE FROM "RateLimit" WHERE "resetAt" < NOW()`;
}
export async function actor(req: Request): Promise<Actor | null> {
  const raw = cookie(req, cookieName);
  if (!raw) return null;
  const session = await db.session.findUnique({
    where: { id: hashToken(raw) },
    include: {
      user: {
        include: {
          roles: { include: { role: { include: { permissions: true } } } },
        },
      },
    },
  });
  if (!session || session.expiresAt < new Date() || session.user.disabled)
    return null;
  const u = session.user;
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    mustChangePassword: u.mustChangePassword,
    roles: u.roles.map((r) => r.roleId),
    permissions: [
      ...new Set(
        u.roles.flatMap((r) => r.role.permissions.map((p) => p.permissionId)),
      ),
    ],
  };
}
export function requirePermission(
  user: Actor | null,
  p: string,
): asserts user is Actor {
  if (!user) throw new AppError(401, "ابتدا وارد شوید.");
  check(!user.mustChangePassword, 403, "ابتدا رمز عبور را تغییر دهید.");
  check(hasPermission(user.permissions, p), 403, "دسترسی مجاز نیست.");
}
// A real hash prevents username-existence timing differences.
const dummy = "$2b$12$KIXkUoSp.KUKMoVrJhYwxu1MgQV.RIwOmrOnfHGxMtF8jxDvYnQaG";
export async function verifyPassword(password: string, hash?: string) {
  return bcrypt.compare(password, hash ?? dummy);
}
export async function passwordHash(password: string) {
  check(
    password.length >= 12 &&
      password.length <= 72 &&
      /[A-Za-z]/.test(password) &&
      /[0-9]/.test(password),
    400,
    "رمز باید ۱۲ تا ۷۲ نویسه و شامل حرف انگلیسی و عدد باشد.",
  );
  check(Buffer.byteLength(password) <= 72, 400, "رمز عبور حداکثر ۷۲ بایت است.");
  return bcrypt.hash(password, 12);
}
