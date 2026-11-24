import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "./db";
import { type Actor, requirePermission } from "./auth";
import { audit } from "./audit";
import { check, AppError } from "./errors";
import { decorative, schemaValidator, type Field } from "./forms/engine";
import { csv } from "./queries";
import { statuses } from "./client";
import { dateTime } from "./utils";

const EXPORT_MAX_ROWS = 8000;
const FILTER_MAX = 25;
const COLUMNS_MAX = 60;

const fieldKey = z
  .string()
  .regex(/^_?[a-zA-Z][a-zA-Z0-9_]{0,63}$/)
  .max(64);

const filterOps = [
  "eq",
  "neq",
  "contains",
  "not_contains",
  "gte",
  "lte",
  "between",
  "empty",
  "not_empty",
  "array_contains",
  "repeater_any",
] as const;

export const exportFilterSchema = z
  .object({
    field: fieldKey,
    op: z.enum(filterOps),
    value: z.string().max(300).optional(),
    valueTo: z.string().max(300).optional(),
    childKey: fieldKey.optional(),
  })
  .strict();

export const advancedExportInput = z
  .object({
    formSlug: z.string().min(1).max(80),
    status: z
      .enum([
        "",
        "NEW",
        "UNDER_REVIEW",
        "NEEDS_CORRECTION",
        "APPROVED",
        "REJECTED",
        "CANCELLED",
      ])
      .optional()
      .default(""),
    createdFrom: z.string().max(32).optional().default(""),
    createdTo: z.string().max(32).optional().default(""),
    filters: z.array(exportFilterSchema).max(FILTER_MAX).default([]),
    columns: z.array(fieldKey).min(1).max(COLUMNS_MAX),
    preview: z.boolean().optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    const iso = /^\d{4}-\d{2}-\d{2}$/;
    if (v.createdFrom && !iso.test(v.createdFrom))
      ctx.addIssue({
        code: "custom",
        message: "تاریخ شروع نامعتبر است.",
        path: ["createdFrom"],
      });
    if (v.createdTo && !iso.test(v.createdTo))
      ctx.addIssue({
        code: "custom",
        message: "تاریخ پایان نامعتبر است.",
        path: ["createdTo"],
      });
  });

export type AdvancedExportInput = z.infer<typeof advancedExportInput>;

const SKIP_TYPES = new Set([
  "section",
  "heading",
  "description",
  "file",
  "image",
]);

export function exportableFields(fields: Field[]) {
  const out: {
    key: string;
    label: string;
    type: Field["type"];
    options?: string[];
    children?: {
      key: string;
      label: string;
      type: Field["type"];
      options?: string[];
    }[];
  }[] = [];
  for (const f of fields) {
    if (decorative(f) || SKIP_TYPES.has(f.type)) continue;
    out.push({
      key: f.key,
      label: f.label.slice(0, 120),
      type: f.type,
      options: f.options,
      children: f.children
        ?.filter((c) => !decorative(c) && !SKIP_TYPES.has(c.type))
        .map((c) => ({
          key: c.key,
          label: c.label.slice(0, 80),
          type: c.type,
          options: c.options,
        })),
    });
  }
  return out;
}

function cellValue(v: unknown): string {
  if (v == null || v === "") return "";
  if (typeof v === "boolean") return v ? "بله" : "خیر";
  if (typeof v === "number") return String(v);
  if (typeof v === "string") return v;
  if (Array.isArray(v)) {
    if (v.every((x) => typeof x === "string" || typeof x === "number"))
      return v.map(String).join("، ");
    return v
      .map((row) => {
        if (!row || typeof row !== "object") return String(row);
        return Object.entries(row as Record<string, unknown>)
          .filter(([, val]) => val != null && val !== "")
          .map(([k, val]) => `${k}: ${cellValue(val)}`)
          .join(" | ");
      })
      .filter(Boolean)
      .join(" ‖ ");
  }
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/** متن اسکالر JSON برای مقایسه */
const SCALAR = Prisma.sql`(CASE
  WHEN jsonb_typeof(v.value) = 'string' THEN v.value #>> '{}'
  WHEN jsonb_typeof(v.value) IN ('number','boolean') THEN v.value #>> '{}'
  ELSE NULL
END)`;

function buildFilterSql(
  rule: z.infer<typeof exportFilterSchema>,
  allowed: Set<string>,
  childAllowed: Map<string, Set<string>>,
): Prisma.Sql {
  check(allowed.has(rule.field), 400, "فیلد فیلتر نامعتبر است: " + rule.field);

  if (rule.op === "empty") {
    return Prisma.sql`(
      NOT EXISTS (
        SELECT 1 FROM "FormSubmissionValue" v
        WHERE v."submissionId" = fs.id AND v."fieldKey" = ${rule.field}
      )
      OR EXISTS (
        SELECT 1 FROM "FormSubmissionValue" v
        WHERE v."submissionId" = fs.id AND v."fieldKey" = ${rule.field}
          AND (
            v.value = 'null'::jsonb
            OR v.value = '""'::jsonb
            OR v.value = '[]'::jsonb
            OR v.value = '{}'::jsonb
          )
      )
    )`;
  }
  if (rule.op === "not_empty") {
    return Prisma.sql`EXISTS (
      SELECT 1 FROM "FormSubmissionValue" v
      WHERE v."submissionId" = fs.id AND v."fieldKey" = ${rule.field}
        AND NOT (
          v.value = 'null'::jsonb
          OR v.value = '""'::jsonb
          OR v.value = '[]'::jsonb
          OR v.value = '{}'::jsonb
        )
    )`;
  }

  const needValue = !["empty", "not_empty"].includes(rule.op);
  if (needValue)
    check(rule.value != null && rule.value !== "", 400, "مقدار فیلتر لازم است.");

  if (rule.op === "eq") {
    return Prisma.sql`EXISTS (
      SELECT 1 FROM "FormSubmissionValue" v
      WHERE v."submissionId" = fs.id AND v."fieldKey" = ${rule.field}
        AND ${SCALAR} = ${rule.value!}
    )`;
  }
  if (rule.op === "neq") {
    return Prisma.sql`NOT EXISTS (
      SELECT 1 FROM "FormSubmissionValue" v
      WHERE v."submissionId" = fs.id AND v."fieldKey" = ${rule.field}
        AND ${SCALAR} = ${rule.value!}
    )`;
  }
  if (rule.op === "contains") {
    return Prisma.sql`EXISTS (
      SELECT 1 FROM "FormSubmissionValue" v
      WHERE v."submissionId" = fs.id AND v."fieldKey" = ${rule.field}
        AND COALESCE(${SCALAR}, v.value::text) ILIKE ${"%" + rule.value! + "%"}
    )`;
  }
  if (rule.op === "not_contains") {
    return Prisma.sql`NOT EXISTS (
      SELECT 1 FROM "FormSubmissionValue" v
      WHERE v."submissionId" = fs.id AND v."fieldKey" = ${rule.field}
        AND COALESCE(${SCALAR}, v.value::text) ILIKE ${"%" + rule.value! + "%"}
    )`;
  }
  if (rule.op === "gte") {
    return Prisma.sql`EXISTS (
      SELECT 1 FROM "FormSubmissionValue" v
      WHERE v."submissionId" = fs.id AND v."fieldKey" = ${rule.field}
        AND ${SCALAR} >= ${rule.value!}
    )`;
  }
  if (rule.op === "lte") {
    return Prisma.sql`EXISTS (
      SELECT 1 FROM "FormSubmissionValue" v
      WHERE v."submissionId" = fs.id AND v."fieldKey" = ${rule.field}
        AND ${SCALAR} <= ${rule.value!}
    )`;
  }
  if (rule.op === "between") {
    check(!!rule.valueTo, 400, "برای بازه، هر دو مقدار لازم است.");
    return Prisma.sql`EXISTS (
      SELECT 1 FROM "FormSubmissionValue" v
      WHERE v."submissionId" = fs.id AND v."fieldKey" = ${rule.field}
        AND ${SCALAR} >= ${rule.value!}
        AND ${SCALAR} <= ${rule.valueTo!}
    )`;
  }
  if (rule.op === "array_contains") {
    return Prisma.sql`EXISTS (
      SELECT 1 FROM "FormSubmissionValue" v
      WHERE v."submissionId" = fs.id AND v."fieldKey" = ${rule.field}
        AND jsonb_typeof(v.value) = 'array'
        AND v.value ? ${rule.value!}
    )`;
  }
  if (rule.op === "repeater_any") {
    check(rule.childKey, 400, "کلید فرزند برای فیلتر تکرارشونده لازم است.");
    const kids = childAllowed.get(rule.field);
    check(!!kids?.has(rule.childKey), 400, "فیلد فرزند نامعتبر است.");
    const child = rule.childKey;
    const exact = rule.valueTo === "eq";
    if (exact) {
      return Prisma.sql`EXISTS (
        SELECT 1 FROM "FormSubmissionValue" v
        WHERE v."submissionId" = fs.id AND v."fieldKey" = ${rule.field}
          AND jsonb_typeof(v.value) = 'array'
          AND EXISTS (
            SELECT 1 FROM jsonb_array_elements(v.value) e
            WHERE COALESCE(e->>${child}, '') = ${rule.value!}
          )
      )`;
    }
    return Prisma.sql`EXISTS (
      SELECT 1 FROM "FormSubmissionValue" v
      WHERE v."submissionId" = fs.id AND v."fieldKey" = ${rule.field}
        AND jsonb_typeof(v.value) = 'array'
        AND EXISTS (
          SELECT 1 FROM jsonb_array_elements(v.value) e
          WHERE COALESCE(e->>${child}, '') ILIKE ${"%" + rule.value! + "%"}
        )
    )`;
  }
  throw new AppError(400, "عملگر فیلتر پشتیبانی نمی‌شود.");
}

export async function exportMeta(formSlug: string, user: Actor) {
  requirePermission(user, "reports.export");
  requirePermission(user, "requests.read");
  const form = await db.form.findUnique({ where: { slug: formSlug } });
  check(form && form.currentVersionId, 404, "فرم یافت نشد.");
  if (form.sensitive) requirePermission(user, "submissions.sensitive");
  const version = await db.formVersion.findUniqueOrThrow({
    where: { id: form.currentVersionId! },
  });
  const schema = schemaValidator.parse(version.schema);
  return {
    form: { id: form.id, slug: form.slug, title: form.title },
    fields: exportableFields(schema.fields),
    systemColumns: [
      { key: "_membershipNumber", label: "کد عضویت" },
      { key: "_requestStatus", label: "وضعیت درخواست" },
      { key: "_createdAt", label: "تاریخ ثبت درخواست" },
      { key: "_firstName", label: "نام" },
      { key: "_lastName", label: "نام خانوادگی" },
      { key: "_nationalId", label: "کد ملی" },
      { key: "_mobile", label: "موبایل" },
    ],
  };
}

export async function listExportForms(user: Actor) {
  requirePermission(user, "reports.export");
  const items = await db.form.findMany({
    where: {
      status: "PUBLISHED",
      purpose: "APPLICATION",
      ...(user.permissions.includes("submissions.sensitive")
        ? {}
        : { sensitive: false }),
    },
    orderBy: { title: "asc" },
    select: { slug: true, title: true, sensitive: true },
  });
  return { items };
}

export async function runAdvancedExport(
  input: unknown,
  user: Actor,
  ip: string,
) {
  requirePermission(user, "reports.export");
  requirePermission(user, "requests.read");
  requirePermission(user, "people.read");
  const p = advancedExportInput.parse(input);

  const form = await db.form.findUnique({ where: { slug: p.formSlug } });
  check(form && form.currentVersionId, 404, "فرم یافت نشد.");
  if (form.sensitive) requirePermission(user, "submissions.sensitive");

  const version = await db.formVersion.findUniqueOrThrow({
    where: { id: form.currentVersionId! },
  });
  const schema = schemaValidator.parse(version.schema);
  const fields = exportableFields(schema.fields);
  const allowed = new Set(fields.map((f) => f.key));
  const childAllowed = new Map(
    fields.map((f) => [f.key, new Set((f.children ?? []).map((c) => c.key))]),
  );
  const labelByKey = Object.fromEntries(fields.map((f) => [f.key, f.label]));

  const systemKeys = new Set([
    "_membershipNumber",
    "_requestStatus",
    "_createdAt",
    "_firstName",
    "_lastName",
    "_nationalId",
    "_mobile",
  ]);
  for (const col of p.columns) {
    check(
      allowed.has(col) || systemKeys.has(col),
      400,
      "ستون خروجی نامعتبر است: " + col,
    );
  }

  const whereParts: Prisma.Sql[] = [
    Prisma.sql`fs."versionId" IN (
      SELECT id FROM "FormVersion" WHERE "formId" = ${form.id}
    )`,
  ];
  if (p.status) {
    whereParts.push(Prisma.sql`mr.status = ${p.status}::"RequestStatus"`);
  }
  if (p.createdFrom) {
    whereParts.push(
      Prisma.sql`mr."createdAt" >= ${new Date(p.createdFrom + "T00:00:00.000Z")}`,
    );
  }
  if (p.createdTo) {
    whereParts.push(
      Prisma.sql`mr."createdAt" <= ${new Date(p.createdTo + "T23:59:59.999Z")}`,
    );
  }
  for (const rule of p.filters) {
    whereParts.push(buildFilterSql(rule, allowed, childAllowed));
  }

  const whereSql = Prisma.join(whereParts, " AND ");

  const countRows = await db.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*)::bigint AS count
    FROM "MembershipRequest" mr
    INNER JOIN "FormSubmission" fs ON fs.id = mr."primarySubmissionId"
    WHERE ${whereSql}
  `;
  const total = Number(countRows[0]?.count ?? 0);

  if (p.preview) {
    return { total, capped: EXPORT_MAX_ROWS };
  }

  check(
    total <= EXPORT_MAX_ROWS,
    400,
    `نتیجه بیش از ${EXPORT_MAX_ROWS.toLocaleString("fa-IR")} رکورد است. فیلترها را محدودتر کنید.`,
  );

  const idRows = await db.$queryRaw<{ id: string }[]>`
    SELECT mr.id
    FROM "MembershipRequest" mr
    INNER JOIN "FormSubmission" fs ON fs.id = mr."primarySubmissionId"
    WHERE ${whereSql}
    ORDER BY mr."createdAt" DESC
    LIMIT ${EXPORT_MAX_ROWS}
  `;

  const ids = idRows.map((r) => r.id);
  const stamp = new Date().toISOString().slice(0, 10);
  if (!ids.length) {
    await audit(db, user.id, "خروجی اکسل پیشرفته", "Export", undefined, ip, {
      form: form.slug,
      rows: 0,
    });
    return {
      csv: csv([["نتیجه‌ای یافت نشد"]]),
      total: 0,
      filename: `export-${form.slug}-${stamp}.csv`,
    };
  }

  const requests = await db.membershipRequest.findMany({
    where: { id: { in: ids } },
    include: {
      person: {
        select: {
          firstName: true,
          lastName: true,
          nationalId: true,
          mobile: true,
        },
      },
      member: { select: { membershipNumber: true } },
      primarySubmission: { select: { data: true } },
    },
  });
  const byId = new Map(requests.map((r) => [r.id, r]));
  const ordered = ids
    .map((id) => byId.get(id))
    .filter(Boolean) as typeof requests;

  const systemLabels: Record<string, string> = {
    _membershipNumber: "کد عضویت",
    _requestStatus: "وضعیت درخواست",
    _createdAt: "تاریخ ثبت درخواست",
    _firstName: "نام",
    _lastName: "نام خانوادگی",
    _nationalId: "کد ملی",
    _mobile: "موبایل",
  };

  const header = p.columns.map((c) => systemLabels[c] ?? labelByKey[c] ?? c);
  const rows: unknown[][] = [header];

  for (const r of ordered) {
    const data = (r.primarySubmission.data ?? {}) as Record<string, unknown>;
    const membership =
      r.member?.membershipNumber ||
      (typeof data.membershipNumber === "string" ? data.membershipNumber : "") ||
      "";
    rows.push(
      p.columns.map((c) => {
        switch (c) {
          case "_membershipNumber":
            return membership;
          case "_requestStatus":
            return statuses[r.status] ?? r.status;
          case "_createdAt":
            return dateTime(r.createdAt);
          case "_firstName":
            return r.person.firstName;
          case "_lastName":
            return r.person.lastName;
          case "_nationalId":
            return r.person.nationalId ?? "";
          case "_mobile":
            return r.person.mobile ?? "";
          default:
            return cellValue(data[c]);
        }
      }),
    );
  }

  await audit(db, user.id, "خروجی اکسل پیشرفته", "Export", undefined, ip, {
    form: form.slug,
    rows: rows.length - 1,
    filters: p.filters.length,
  });

  return {
    csv: csv(rows),
    total: rows.length - 1,
    filename: `export-${form.slug}-${stamp}.csv`,
  };
}
