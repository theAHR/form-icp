import { readFile, writeFile } from "node:fs/promises";
import { Prisma } from "@prisma/client";
import { db } from "../lib/db";
import { schemaValidator, type FormSchema } from "../lib/forms/engine";

interface ExportedForm {
  slug: string;
  title: string;
  purpose: string;
  public: boolean;
  sensitive: boolean;
  status: "PUBLISHED" | "DRAFT";
  schema: FormSchema;
}
interface ExportFile {
  format: "icp-forms";
  version: 1;
  exportedAt: string;
  forms: ExportedForm[];
}

async function exportTo(file: string) {
  const forms = await db.form.findMany({
    where: { status: { not: "ARCHIVED" } },
    include: {
      currentVersion: true,
      versions: { orderBy: { number: "desc" }, take: 1 },
    },
    orderBy: { createdAt: "asc" },
  });
  const out: ExportFile = {
    format: "icp-forms",
    version: 1,
    exportedAt: new Date().toISOString(),
    forms: [],
  };
  for (const f of forms) {
    const v = f.currentVersion ?? f.versions[0];
    if (!v) continue;
    out.forms.push({
      slug: f.slug,
      title: v.title,
      purpose: v.purpose,
      public: v.public,
      sensitive: v.sensitive,
      status: f.currentVersion ? "PUBLISHED" : "DRAFT",
      schema: v.schema as unknown as FormSchema,
    });
    console.log(`  + ${v.title} (${f.slug})`);
  }
  await writeFile(file, JSON.stringify(out, null, 2), "utf8");
  console.log(`${out.forms.length} فرم در ${file} ذخیره شد.`);
}

async function importFrom(file: string) {
  const data = JSON.parse(await readFile(file, "utf8")) as ExportFile;
  if (data.format !== "icp-forms" || data.version !== 1)
    throw new Error("این فایل خروجی فرم‌های سامانه نیست.");
  for (const f of data.forms) {
    schemaValidator.parse(f.schema);
    const publish = f.status === "PUBLISHED";
    const existing = await db.form.findUnique({
      where: { slug: f.slug },
      include: {
        currentVersion: true,
        versions: { orderBy: { number: "desc" }, take: 1 },
      },
    });
    const cur = existing?.currentVersion;
    if (
      cur &&
      publish &&
      JSON.stringify(cur.schema) === JSON.stringify(f.schema) &&
      cur.title === f.title &&
      cur.purpose === f.purpose &&
      cur.public === f.public &&
      cur.sensitive === f.sensitive
    ) {
      console.log(`  = ${f.title} (بدون تغییر)`);
      continue;
    }
    await db.$transaction(async (tx) => {
      const form =
        existing ??
        (await tx.form.create({
          data: { slug: f.slug, title: f.title, purpose: f.purpose },
        }));
      const version = await tx.formVersion.create({
        data: {
          formId: form.id,
          number: (existing?.versions[0]?.number ?? 0) + 1,
          slug: f.slug,
          title: f.title,
          purpose: f.purpose,
          public: f.public,
          sensitive: f.sensitive,
          schema: f.schema as unknown as Prisma.InputJsonValue,
          publishedAt: publish ? new Date() : null,
          fields: {
            create: f.schema.fields.map((field, position) => ({
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
          title: f.title,
          purpose: f.purpose,
          public: f.public,
          sensitive: f.sensitive,
          ...(publish
            ? { status: "PUBLISHED", currentVersionId: version.id }
            : {}),
        },
      });
    });
    console.log(`  + ${f.title} (${existing ? "نسخهٔ جدید" : "فرم جدید"})`);
  }
  console.log("ورود فرم‌ها کامل شد.");
}

const [command, file = "forms-export.json"] = process.argv.slice(2);
(command === "export"
  ? exportTo(file)
  : command === "import"
    ? importFrom(file)
    : Promise.reject(
        new Error(
          "Usage: npm run forms:export [file] | npm run forms:import [file]",
        ),
      )
)
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
