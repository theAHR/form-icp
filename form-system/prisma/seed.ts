import { db } from "../lib/db";
import { passwordHash } from "../lib/auth";
import { permissions, rolePermissions } from "../lib/permissions";
import {
  schemaValidator,
  type Field,
  type FormSchema,
} from "../lib/forms/engine";
import { memberPersonalInfo } from "../lib/forms/schemas/member-personal-info";
import { Prisma } from "@prisma/client";

const ORG_NAME = "حزب مؤتلفه اسلامی";

async function ensureForm(
  slug: string,
  title: string,
  purpose: string,
  isPublic: boolean,
  schema: FormSchema,
) {
  schemaValidator.parse(schema);
  const existing = await db.form.findUnique({
    where: { slug },
    include: { currentVersion: true },
  });
  if (!existing) {
    await db.$transaction(async (tx) => {
      const form = await tx.form.create({
        data: { slug, title, purpose, public: isPublic },
      });
      const version = await tx.formVersion.create({
        data: {
          formId: form.id,
          number: 1,
          title,
          slug,
          public: isPublic,
          purpose,
          schema: schema as unknown as Prisma.InputJsonValue,
          publishedAt: new Date(),
          fields: {
            create: schema.fields.map((field, position) => ({
              key: field.key,
              position,
              definition: field as unknown as Prisma.InputJsonValue,
            })),
          },
        },
      });
      await tx.form.update({
        where: { id: form.id },
        data: { status: "PUBLISHED", currentVersionId: version.id },
      });
    });
    return;
  }
  const currentSchema = JSON.stringify(existing.currentVersion?.schema ?? null);
  const nextSchema = JSON.stringify(schema);
  if (
    currentSchema === nextSchema &&
    existing.title === title &&
    existing.purpose === purpose &&
    existing.public === isPublic &&
    existing.status === "PUBLISHED"
  )
    return;
  const top = await db.formVersion.findFirst({
    where: { formId: existing.id },
    orderBy: { number: "desc" },
  });
  const number = (top?.number ?? 0) + 1;
  await db.$transaction(async (tx) => {
    const version = await tx.formVersion.create({
      data: {
        formId: existing.id,
        number,
        title,
        slug,
        public: isPublic,
        purpose,
        schema: schema as unknown as Prisma.InputJsonValue,
        publishedAt: new Date(),
        fields: {
          create: schema.fields.map((field, position) => ({
            key: field.key,
            position,
            definition: field as unknown as Prisma.InputJsonValue,
          })),
        },
      },
    });
    await tx.form.update({
      where: { id: existing.id },
      data: {
        title,
        purpose,
        public: isPublic,
        status: "PUBLISHED",
        currentVersionId: version.id,
      },
    });
  });
}

async function main() {
  const dev =
    process.env.ALLOW_DEV_SEED === "true" &&
    process.env.NODE_ENV !== "production";
  const password =
    process.env.SEED_ADMIN_PASSWORD || (dev ? "Admin@123456" : "");
  if (!password)
    throw new Error(
      "Set SEED_ADMIN_PASSWORD (12+ characters) or explicitly ALLOW_DEV_SEED=true outside production.",
    );
  if (!dev && password === "Admin@123456")
    throw new Error(
      "Development password is forbidden outside development seed.",
    );
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
      where: {
        roleId: id,
        permissionId: { notIn: [...list] },
      },
    });
    for (const permissionId of list)
      await db.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: id, permissionId } },
        create: { roleId: id, permissionId },
        update: {},
      });
  }
  // مهاجرت نقش‌های قدیمی به دو نقش جدید
  for (const row of await db.userRole.findMany({
    where: { roleId: { in: ["ADMIN", "OPERATOR", "VIEWER"] } },
  })) {
    const next = row.roleId === "ADMIN" ? "SUPER_ADMIN" : "REGISTRAR";
    const exists = await db.userRole.findUnique({
      where: { userId_roleId: { userId: row.userId, roleId: next } },
    });
    if (exists)
      await db.userRole.delete({
        where: { userId_roleId: { userId: row.userId, roleId: row.roleId } },
      });
    else
      await db.userRole.update({
        where: { userId_roleId: { userId: row.userId, roleId: row.roleId } },
        data: { roleId: next },
      });
  }
  await db.rolePermission.deleteMany({
    where: { permissionId: { notIn: [...permissions] } },
  });
  if (!(await db.user.findUnique({ where: { username: "admin" } })))
    await db.user.create({
      data: {
        username: "admin",
        displayName: "مدیر سیستم",
        passwordHash: await passwordHash(password),
        roles: { create: { roleId: "SUPER_ADMIN" } },
      },
    });
  if (dev) {
    if (!(await db.user.findUnique({ where: { username: "registrar" } })))
      await db.user.create({
        data: {
          username: "registrar",
          displayName: "ثبت‌کننده",
          passwordHash: await passwordHash(password),
          roles: { create: { roleId: "REGISTRAR" } },
        },
      });
  }

  const keep = ["membership-application"];
  const obsolete = await db.form.findMany({
    where: { slug: { notIn: keep } },
    select: { id: true, slug: true },
  });
  for (const form of obsolete) {
    await db.form.update({
      where: { id: form.id },
      data: { status: "ARCHIVED", public: false, currentVersionId: null },
    });
  }

  await ensureForm(
    "membership-application",
    "ثبت اطلاعات فردی اعضا",
    "APPLICATION",
    true,
    memberPersonalInfo,
  );

  for (const [key, value] of Object.entries({
    organizationName: ORG_NAME,
    requireInterview: false,
  }))
    await db.systemSetting.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
  console.log(
    "Seed complete. Member personal-info form published with extended fields.",
  );
}
main()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
