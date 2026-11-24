import { type Field, type FormSchema } from "../engine";

const NEW_SACRIFICE_KINDS = ["سابقه بسیج", "سابقه جبهه"];
const EDUCATION_FIELDS: Field[] = [
  { key: "major", label: "رشته تحصیلی", type: "text" },
  { key: "specialization", label: "گرایش تحصیلی", type: "text" },
];

/**
 * افزودن فیلدهای جدید به یک نسخه موجود فرم عضویت، بدون دست زدن به سایر بخش‌ها.
 * خروجی: طرح جدید و فهرست تغییرات (خالی یعنی فرم از قبل به‌روز است).
 */
export function patchMemberFormSchema(input: FormSchema): {
  schema: FormSchema;
  changes: string[];
} {
  const schema = JSON.parse(JSON.stringify(input)) as FormSchema;
  const changes: string[] = [];

  const education = schema.fields.find((f) => f.key === "educationHistory");
  if (education?.type === "repeater") {
    const children = (education.children ??= []);
    const degreeIdx = children.findIndex((c) => c.key === "degree");
    let insertAt = degreeIdx >= 0 ? degreeIdx + 1 : 0;
    for (const field of EDUCATION_FIELDS) {
      const existing = children.findIndex((c) => c.key === field.key);
      if (existing >= 0) {
        insertAt = existing + 1;
        continue;
      }
      children.splice(insertAt, 0, { ...field });
      insertAt++;
      changes.push(`سوابق تحصیلی: افزودن «${field.label}»`);
    }
  }

  const sacrifice = schema.fields.find((f) => f.key === "sacrificeRecords");
  const kind = sacrifice?.children?.find((c) => c.key === "kind");
  if (kind?.options) {
    for (const option of NEW_SACRIFICE_KINDS)
      if (!kind.options.includes(option)) {
        kind.options.push(option);
        changes.push(`سوابق ایثارگری: افزودن گزینه «${option}»`);
      }
  }

  const note = schema.fields.find((f) => f.key === "sacrificeNote");
  if (note && note.label.includes("برای جانباز و آزاده")) {
    note.label = note.label.replace(
      "برای جانباز و آزاده",
      "برای جانباز، آزاده، سابقه بسیج و سابقه جبهه",
    );
    changes.push("به‌روزرسانی متن راهنمای سوابق ایثارگری");
  }

  return { schema, changes };
}
