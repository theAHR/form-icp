/**
 * همگام‌سازی دو نقش (مدیر سیستم / ثبت‌کننده) بدون نیاز به seed کامل.
 */
import { db } from "../lib/db";
import { permissions, rolePermissions } from "../lib/permissions";

async function main() {
  for (const id of permissions)
    await db.permission.upsert({ where: { id }, create: { id }, update: {} });

  const roleNames: Record<string, string> = {
    SUPER_ADMIN: "مدیر سیستم",
    REGISTRAR: "ثبت‌کننده",
  };
  for (const [id, list] of Object.entries(rolePermissions)) {
    await db.role.upsert({
      where: { id },
      create: { id, name: roleNames[id] ?? id },
      update: { name: roleNames[id] ?? id },
    });
    await db.rolePermission.deleteMany({
      where: { roleId: id, permissionId: { notIn: [...list] } },
    });
    for (const permissionId of list)
      await db.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: id, permissionId } },
        create: { roleId: id, permissionId },
        update: {},
      });
  }

  // نقش‌های قدیمی را به دو نقش جدید منتقل کن (با جلوگیری از تکراری)
  const legacy = await db.userRole.findMany({
    where: { roleId: { in: ["ADMIN", "OPERATOR", "VIEWER"] } },
  });
  let moved = 0;
  for (const row of legacy) {
    const next =
      row.roleId === "ADMIN" ? "SUPER_ADMIN" : ("REGISTRAR" as const);
    const exists = await db.userRole.findUnique({
      where: { userId_roleId: { userId: row.userId, roleId: next } },
    });
    if (exists) await db.userRole.delete({ where: { userId_roleId: { userId: row.userId, roleId: row.roleId } } });
    else
      await db.userRole.update({
        where: { userId_roleId: { userId: row.userId, roleId: row.roleId } },
        data: { roleId: next },
      });
    moved++;
  }

  await db.rolePermission.deleteMany({
    where: { permissionId: { notIn: [...permissions] } },
  });

  // تا دسترسی‌های جدید بلافاصله اعمال شود
  await db.session.deleteMany({});

  console.log("roles synced", { moved });
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
