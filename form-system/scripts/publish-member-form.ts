import { Prisma } from "@prisma/client";
import { db } from "../lib/db";
import { schemaValidator } from "../lib/forms/engine";
import { memberPersonalInfo } from "../lib/forms/schemas/member-personal-info";

async function main() {
  schemaValidator.parse(memberPersonalInfo);
  const slug = "membership-application";
  const title = "ثبت اطلاعات فردی اعضا";
  const existing = await db.form.findUnique({
    where: { slug },
    include: {
      versions: { orderBy: { number: "desc" }, take: 1 },
    },
  });
  await db.$transaction(async (tx) => {
    const form =
      existing ??
      (await tx.form.create({
        data: { slug, title, purpose: "APPLICATION", public: true },
      }));
    const version = await tx.formVersion.create({
      data: {
        formId: form.id,
        number: (existing?.versions[0]?.number ?? 0) + 1,
        slug,
        title,
        purpose: "APPLICATION",
        public: true,
        sensitive: false,
        schema: memberPersonalInfo as unknown as Prisma.InputJsonValue,
        publishedAt: new Date(),
        fields: {
          create: memberPersonalInfo.fields.map((field, position) => ({
            key: field.key,
            position,
            definition: field as unknown as Prisma.InputJsonValue,
          })),
        },
      },
    });
    await tx.form.update({
      where: { id: form.id },
      data: {
        title,
        purpose: "APPLICATION",
        public: true,
        status: "PUBLISHED",
        currentVersionId: version.id,
      },
    });
  });
  console.log(
    "published",
    title,
    "fields=",
    memberPersonalInfo.fields.length,
    "version=",
    (existing?.versions[0]?.number ?? 0) + 1,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
