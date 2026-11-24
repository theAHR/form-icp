import { db } from "../lib/db";
async function main() {
  const now = new Date();
  const sessions = await db.session.deleteMany({
    where: { expiresAt: { lt: now } },
  });
  const limits = await db.rateLimit.deleteMany({
    where: { resetAt: { lt: now } },
  });
  console.log({
    expiredSessionsRemoved: sessions.count,
    expiredRateLimitsRemoved: limits.count,
  });
}
main().finally(() => db.$disconnect());
