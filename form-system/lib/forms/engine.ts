import { z } from "zod";
import { isJobType } from "./job-types";
export const fieldTypes = [
  "text",
  "textarea",
  "number",
  "email",
  "phone",
  "nationalId",
  "date",
  "select",
  "searchSelect",
  "multiSelect",
  "radio",
  "checkbox",
  "checkboxGroup",
  "file",
  "image",
  "section",
  "heading",
  "description",
  "repeater",
] as const;
export type FieldType = (typeof fieldTypes)[number];
export type OptionsSource = "jobTypes";
export interface Field {
  key: string;
  type: FieldType;
  label: string;
  required?: boolean;
  placeholder?: string;
  options?: string[];
  optionsSource?: OptionsSource;
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: "postalCode" | "digits";
  visibleWhen?: { field: string; equals: string | string[] };
  children?: Field[];
  personField?:
    | "firstName"
    | "lastName"
    | "fatherName"
    | "nationalId"
    | "birthDate"
    | "mobile"
    | "email";
}
export interface FormSchema {
  fields: Field[];
}
const key = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/);
const fieldSchema: z.ZodType<Field> = z.lazy(() =>
  z
    .object({
      key,
      type: z.enum(fieldTypes),
      label: z.string().min(1).max(1000),
      required: z.boolean().optional(),
      placeholder: z.string().max(200).optional(),
      options: z.array(z.string().min(1).max(150)).max(100).optional(),
      optionsSource: z.enum(["jobTypes"]).optional(),
      min: z.number().min(0).max(1000000000).optional(),
      max: z.number().min(0).max(1000000000).optional(),
      minLength: z.number().int().min(0).max(10000).optional(),
      maxLength: z.number().int().min(1).max(10000).optional(),
      pattern: z.enum(["postalCode", "digits"]).optional(),
      visibleWhen: z
        .object({
          field: key,
          equals: z.union([
            z.string().max(150),
            z.array(z.string().max(150)).min(1).max(20),
          ]),
        })
        .strict()
        .optional(),
      children: z.array(fieldSchema).max(30).optional(),
      personField: z
        .enum([
          "firstName",
          "lastName",
          "fatherName",
          "nationalId",
          "birthDate",
          "mobile",
          "email",
        ])
        .optional(),
    })
    .strict(),
);
export const schemaValidator = z
  .object({ fields: z.array(fieldSchema).min(1).max(150) })
  .strict()
  .superRefine((schema, ctx) => {
    const maps = new Set<string>();
    let count = 0;
    function walk(fields: Field[], depth: number) {
      const seen = new Set<string>();
      for (const f of fields) {
        count++;
        if (seen.has(f.key))
          ctx.addIssue({ code: "custom", message: "کلید تکراری: " + f.key });
        if (f.visibleWhen && !seen.has(f.visibleWhen.field))
          ctx.addIssue({
            code: "custom",
            message: "شرط باید به فیلد قبلی همان گروه اشاره کند.",
          });
        seen.add(f.key);
        if (f.min !== undefined && f.max !== undefined && f.min > f.max)
          ctx.addIssue({
            code: "custom",
            message: "حداقل از حداکثر بیشتر است.",
          });
        if (
          f.minLength !== undefined &&
          f.maxLength !== undefined &&
          f.minLength > f.maxLength
        )
          ctx.addIssue({ code: "custom", message: "طول حداقل نامعتبر است." });
        if (
          ["select", "radio", "multiSelect", "checkboxGroup"].includes(
            f.type,
          ) &&
          (!f.options?.length || new Set(f.options).size !== f.options.length)
        )
          ctx.addIssue({
            code: "custom",
            message: "گزینه‌ها باید موجود و غیرتکراری باشند.",
          });
        if (f.type === "searchSelect" && f.optionsSource !== "jobTypes")
          ctx.addIssue({
            code: "custom",
            message: "منبع گزینه‌های جستجوپذیر نامعتبر است.",
          });
        if (f.type === "image" && f.max !== undefined && f.max > 20)
          ctx.addIssue({
            code: "custom",
            message: "حداکثر تعداد تصویر ۲۰ است.",
          });
        if (f.type === "file" && f.max !== undefined && f.max > 500)
          ctx.addIssue({
            code: "custom",
            message: "حداکثر تعداد مدرک ۵۰۰ است.",
          });
        if (f.personField) {
          if (
            depth ||
            maps.has(f.personField) ||
            !["text", "email", "phone", "nationalId", "date"].includes(
              f.type,
            ) ||
            f.visibleWhen
          )
            ctx.addIssue({
              code: "custom",
              message: "نگاشت اطلاعات فرد نامعتبر است.",
            });
          maps.add(f.personField);
          const mappedTypes: Record<string, string> = {
            nationalId: "nationalId",
            mobile: "phone",
            email: "email",
            birthDate: "date",
          };
          if (
            mappedTypes[f.personField] &&
            f.type !== mappedTypes[f.personField]
          )
            ctx.addIssue({
              code: "custom",
              message: "نوع فیلد با نگاشت مشخصات فرد سازگار نیست.",
            });
        }
        if (f.type === "repeater") {
          if (depth >= 1 || !f.children?.length)
            ctx.addIssue({
              code: "custom",
              message:
                "گروه تکرارشونده باید دارای فیلد و بدون گروه تو در تو باشد.",
            });
          if (f.children) walk(f.children, depth + 1);
        } else if (f.children)
          ctx.addIssue({
            code: "custom",
            message: "فقط گروه تکرارشونده می‌تواند فرزند داشته باشد.",
          });
      }
    }
    walk(schema.fields, 0);
    if (count > 200)
      ctx.addIssue({ code: "custom", message: "حداکثر ۲۰۰ فیلد." });
  });
export function normalizeDigits(s: string) {
  return s.replace(/[۰-۹٠-٩]/g, (c) =>
    String(
      "۰۱۲۳۴۵۶۷۸۹".includes(c)
        ? "۰۱۲۳۴۵۶۷۸۹".indexOf(c)
        : "٠١٢٣٤٥٦٧٨٩".indexOf(c),
    ),
  );
}
export function validNationalId(raw: string) {
  const s = normalizeDigits(raw);
  if (!/^\d{10}$/.test(s) || /^(\d)\1{9}$/.test(s)) return false;
  const rem =
    [...s.slice(0, 9)].reduce((n, c, i) => n + Number(c) * (10 - i), 0) % 11;
  return Number(s[9]) === (rem < 2 ? rem : 11 - rem);
}
export function validIsoDate(raw: string) {
  const s = normalizeDigits(raw.trim());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}
export function isVisible(f: Field, values: Record<string, unknown>) {
  if (!f.visibleWhen) return true;
  const actual = String(values[f.visibleWhen.field] ?? "");
  const expected = f.visibleWhen.equals;
  return Array.isArray(expected)
    ? expected.includes(actual)
    : actual === expected;
}
function validFileId(s: string) {
  return /^c[a-z0-9]{20,40}$/.test(s);
}
export const decorative = (f: Field) =>
  ["heading", "section", "description"].includes(f.type);
export function validateAnswers(
  schema: FormSchema,
  input: unknown,
): Record<string, unknown> {
  const errors: z.core.$ZodIssue[] = [];
  const issue = (path: (string | number)[], message: string) =>
    errors.push({ code: "custom", path, message });
  function walk(
    fields: Field[],
    raw: unknown,
    path: (string | number)[],
  ): Record<string, unknown> {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      issue(path, "ساختار پاسخ نامعتبر است.");
      return {};
    }
    const values = raw as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const f of fields) {
      if (decorative(f) || !isVisible(f, values)) continue;
      const p = [...path, f.key];
      let v = values[f.key];
      if (
        v === undefined ||
        v === null ||
        v === "" ||
        (Array.isArray(v) && !v.length)
      ) {
        if (f.required) issue(p, "این فیلد الزامی است.");
        continue;
      }
      if (f.type === "repeater") {
        if (
          !Array.isArray(v) ||
          v.length > Math.min(f.max ?? 30, 30) ||
          v.length < (f.min ?? 0)
        )
          issue(p, "تعداد ردیف‌ها نامعتبر است.");
        else out[f.key] = v.map((r, i) => walk(f.children ?? [], r, [...p, i]));
        continue;
      }
      if (f.type === "checkbox") {
        if (typeof v !== "boolean" || (f.required && v !== true))
          issue(p, "تأیید این گزینه الزامی است.");
        else out[f.key] = v;
        continue;
      }
      if (["multiSelect", "checkboxGroup"].includes(f.type)) {
        if (
          !Array.isArray(v) ||
          v.some((s) => typeof s !== "string" || !f.options?.includes(s)) ||
          new Set(v).size !== v.length ||
          v.length > (f.max ?? 100) ||
          v.length < (f.min ?? 0)
        )
          issue(p, "انتخاب‌ها یا تعداد آن‌ها نامعتبر است.");
        else out[f.key] = v;
        continue;
      }
      if (f.type === "number") {
        if (typeof v === "string") v = normalizeDigits(v);
        const n =
          typeof v === "number" || typeof v === "string" ? Number(v) : NaN;
        if (!Number.isFinite(n) || n < (f.min ?? -1e9) || n > (f.max ?? 1e9))
          issue(p, "عدد خارج از محدوده است.");
        else out[f.key] = n;
        continue;
      }
      if (["file", "image"].includes(f.type) && (f.max ?? 1) > 1) {
        const cap = f.type === "file" ? 500 : 20;
        if (
          !Array.isArray(v) ||
          v.length > Math.min(f.max ?? cap, cap) ||
          v.length < (f.min ?? (f.required ? 1 : 0)) ||
          v.some((id) => typeof id !== "string" || !validFileId(id)) ||
          new Set(v).size !== v.length
        )
          issue(p, "فایل‌های پیوست نامعتبر هستند.");
        else out[f.key] = v;
        continue;
      }
      if (typeof v !== "string") {
        issue(p, "مقدار متنی لازم است.");
        continue;
      }
      v = v.trim();
      const s = v as string;
      if (
        s.length < (f.minLength ?? (f.required ? 1 : 0)) ||
        s.length > (f.maxLength ?? 10000)
      )
        issue(p, "طول متن نامعتبر است.");
      if (["select", "radio"].includes(f.type) && !f.options?.includes(s))
        issue(p, "گزینه نامعتبر است.");
      if (f.type === "searchSelect") {
        if (f.optionsSource === "jobTypes" && !isJobType(s))
          issue(p, "نوع شغل از فهرست معتبر انتخاب نشده است.");
      }
      if (f.type === "email" && !z.email().safeParse(s).success)
        issue(p, "ایمیل نامعتبر است.");
      if (f.type === "nationalId" && !validNationalId(s))
        issue(p, "کد ملی نامعتبر است.");
      if (
        f.type === "phone" &&
        !/^(?:\+98|0)[0-9]{10}$/.test(normalizeDigits(s))
      )
        issue(p, "تلفن باید با صفر یا ۹۸+ شروع شود.");
      if (f.type === "date" && !validIsoDate(s))
        issue(p, "تاریخ معتبر لازم است.");
      if (
        f.pattern === "postalCode" &&
        s &&
        !/^\d{10}$/.test(normalizeDigits(s))
      )
        issue(p, "کدپستی باید ۱۰ رقم باشد.");
      if (f.pattern === "digits" && !/^\d+$/.test(normalizeDigits(s)))
        issue(p, "فقط رقم مجاز است.");
      if (["file", "image"].includes(f.type) && !validFileId(s))
        issue(p, "شناسه فایل نامعتبر است.");
      out[f.key] =
        ["phone", "nationalId", "date"].includes(f.type) || f.pattern
          ? normalizeDigits(s)
          : s;
    }
    return out;
  }
  const data = walk(schema.fields, input, []);
  if (errors.length) throw new z.ZodError(errors);
  return data;
}
export function answerSchema(schema: FormSchema) {
  return z.record(z.string(), z.unknown()).transform((v, ctx) => {
    try {
      return validateAnswers(schema, v);
    } catch (e) {
      if (e instanceof z.ZodError) {
        for (const i of e.issues)
          ctx.addIssue({ code: "custom", path: i.path, message: i.message });
        return z.NEVER;
      }
      throw e;
    }
  });
}
function emptyAnswer(v: unknown) {
  return (
    v === undefined ||
    v === null ||
    v === "" ||
    (Array.isArray(v) && !v.length)
  );
}
/** برچسب فیلدهایی که بین دو پاسخ یک فرم تغییر کرده‌اند (برای تاریخچه پرونده). */
export function changedFieldLabels(
  schema: FormSchema,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): string[] {
  const out: string[] = [];
  for (const f of schema.fields) {
    if (decorative(f)) continue;
    const a = before[f.key];
    const b = after[f.key];
    if (emptyAnswer(a) && emptyAnswer(b)) continue;
    if (JSON.stringify(a ?? null) !== JSON.stringify(b ?? null))
      out.push(f.label);
  }
  return out;
}
export function fileIds(schema: FormSchema, data: Record<string, unknown>) {
  const ids: string[] = [];
  const walk = (fields: Field[], d: Record<string, unknown>) => {
    for (const f of fields) {
      if (["file", "image"].includes(f.type)) {
        const v = d[f.key];
        if (typeof v === "string") ids.push(v);
        else if (Array.isArray(v))
          for (const id of v) if (typeof id === "string") ids.push(id);
      }
      if (f.type === "repeater" && Array.isArray(d[f.key]))
        for (const row of d[f.key] as Record<string, unknown>[])
          walk(f.children ?? [], row);
    }
  };
  walk(schema.fields, data);
  return [...new Set(ids)];
}
