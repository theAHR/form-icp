/**
 * به‌روزرسانی امن فرم «ثبت اطلاعات فردی اعضا» روی نسخه منتشرشده فعلی:
 *  - افزودن «رشته تحصیلی» و «گرایش تحصیلی» به هر ردیف سوابق تحصیلی
 *  - افزودن «سابقه بسیج» و «سابقه جبهه» به گزینه‌های نوع سوابق ایثارگری
 *
 * برخلاف publish-member-form.ts، کل فرم را بازنویسی نمی‌کند؛ فقط موارد بالا را
 * (اگر وجود نداشته باشند) به نسخه فعلی اضافه کرده و نسخه جدید منتشر می‌کند.
 * اجرای دوباره بی‌خطر است.
 *
 *   npm run forms:patch-member            # اعمال
 *   npm run forms:patch-member -- --dry   # فقط نمایش تغییرات
 */
import { Prisma } from "@prisma/client";
import { db } from "../lib/db";
import { schemaValidator, type FormSchema } from "../lib/forms/engine";
import { patchMemberFormSchema } from "../lib/forms/schemas/member-form-patch";

async function main() {
  const dry = process.argv.includes("--dry");
  const slug = "membership-application";
  const form = await db.form.findUnique({
    where: { slug },
    include: { currentVersion: true },
  });
  if (!form?.currentVersion)
    throw new Error("فرم منتشرشده‌ای با شناسه " + slug + " یافت نشد.");
  const current = form.currentVersion;
  const { schema, changes } = patchMemberFormSchema(
    current.schema as unknown as FormSchema,
  );
  if (!changes.length) {
    console.log("فرم از قبل به‌روز است؛ تغییری لازم نیست. نسخه:", current.number);
    return;
  }
  schemaValidator.parse(schema);
  console.log("تغییرات:\n - " + changes.join("\n - "));
  if (dry) return;
  const latest = await db.formVersion.findFirst({
    where: { formId: form.id },
    orderBy: { number: "desc" },
  });
  const number = (latest?.number ?? 0) + 1;
  await db.$transaction(async (tx) => {
    const version = await tx.formVersion.create({
      data: {
        formId: form.id,
        number,
        slug: current.slug,
        title: current.title,
        purpose: current.purpose,
        public: current.public,
        sensitive: current.sensitive,
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
    await tx.auditLog.create({
      data: {
        actorId: null,
        action: "انتشار فرم",
        entity: "Form",
        entityId: form.id,
        metadata: { version: number, script: "patch-member-form", changes },
      },
    });
  });
  console.log("نسخه جدید منتشر شد:", number);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
