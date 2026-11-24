import { z } from "zod";
import { db } from "./db";
import { audit } from "./audit";
import { passwordHash, requirePermission, type Actor } from "./auth";
import { check } from "./errors";
import { transaction } from "./service";
export async function saveUser(input: unknown, actor: Actor, ip: string) {
  requirePermission(actor, "users.manage");
  const p = z
    .object({
      id: z.string().optional(),
      username: z.string().regex(/^[a-zA-Z0-9_.-]{3,50}$/),
      displayName: z.string().min(2).max(100),
      role: z.enum(["SUPER_ADMIN", "REGISTRAR"]),
      disabled: z.boolean(),
      password: z.string().optional(),
    })
    .strict()
    .parse(input);
  const hash = p.password ? await passwordHash(p.password) : undefined;
  return transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(927164)`;
    const old = p.id
      ? await tx.user.findUnique({
          where: { id: p.id },
          include: { roles: true },
        })
      : null;
    check(!p.id || old, 404, "کاربر یافت نشد.");
    check(old || hash, 400, "رمز عبور لازم است.");
    const superAdmin = actor.roles.includes("SUPER_ADMIN");
    check(
      superAdmin ||
        (p.role === "REGISTRAR" &&
          !old?.roles.some((r) => r.roleId === "SUPER_ADMIN")),
      403,
      "فقط مدیر سیستم می‌تواند نقش‌ها را مدیریت کند.",
    );
    check(
      p.id !== actor.id ||
        (!p.disabled && old?.roles.some((r) => r.roleId === p.role)),
      400,
      "نقش یا وضعیت حساب خود را تغییر ندهید.",
    );
    if (
      old?.roles.some((r) => r.roleId === "SUPER_ADMIN") &&
      (p.disabled || p.role !== "SUPER_ADMIN")
    ) {
      const count = await tx.user.count({
        where: { disabled: false, roles: { some: { roleId: "SUPER_ADMIN" } } },
      });
      check(count > 1, 400, "آخرین مدیر ارشد را نمی‌توان غیرفعال کرد.");
    }
    const data = {
      username: p.username,
      displayName: p.displayName,
      disabled: p.disabled,
      ...(hash ? { passwordHash: hash, mustChangePassword: true } : {}),
    };
    const user = old
      ? await tx.user.update({ where: { id: old.id }, data })
      : await tx.user.create({ data: { ...data, passwordHash: hash! } });
    await tx.userRole.deleteMany({ where: { userId: user.id } });
    await tx.userRole.create({ data: { userId: user.id, roleId: p.role } });
    await tx.session.deleteMany({ where: { userId: user.id } });
    await audit(
      tx,
      actor.id,
      old ? "به‌روزرسانی کاربر" : "ایجاد کاربر",
      "User",
      user.id,
      ip,
      { role: p.role, disabled: p.disabled, passwordReset: !!hash },
    );
    return { id: user.id };
  });
}
export async function deleteUser(input: unknown, actor: Actor, ip: string) {
  requirePermission(actor, "users.manage");
  const p = z.object({ id: z.string().min(1).max(64) }).strict().parse(input);
  check(p.id !== actor.id, 400, "حساب خود را نمی‌توانید حذف کنید.");
  return transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(927164)`;
    const target = await tx.user.findUnique({
      where: { id: p.id },
      include: { roles: true },
    });
    check(target, 404, "کاربر یافت نشد.");
    if (target.roles.some((r) => r.roleId === "SUPER_ADMIN")) {
      check(
        actor.roles.includes("SUPER_ADMIN"),
        403,
        "فقط مدیر سیستم می‌تواند مدیر را حذف کند.",
      );
      const count = await tx.user.count({
        where: {
          disabled: false,
          roles: { some: { roleId: "SUPER_ADMIN" } },
          NOT: { id: target.id },
        },
      });
      check(count >= 1, 400, "آخرین مدیر ارشد را نمی‌توان حذف کرد.");
    }
    await tx.membershipRequest.updateMany({
      where: { assignedTo: target.id },
      data: { assignedTo: null },
    });
    await tx.session.deleteMany({ where: { userId: target.id } });
    await tx.userRole.deleteMany({ where: { userId: target.id } });
    await tx.user.delete({ where: { id: target.id } });
    await audit(tx, actor.id, "حذف کاربر", "User", target.id, ip, {
      username: target.username,
    });
    return { ok: true };
  });
}
