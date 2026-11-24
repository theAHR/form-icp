import { describe, it, expect } from "vitest";
import {
  schemaValidator,
  validateAnswers,
  validNationalId,
  normalizeDigits,
  type FormSchema,
} from "../lib/forms/engine";
import { changedFieldLabels } from "../lib/forms/engine";
import { memberPersonalInfo } from "../lib/forms/schemas/member-personal-info";
import { patchMemberFormSchema } from "../lib/forms/schemas/member-form-patch";
import { assertTransition } from "../lib/workflow";
import { hasPermission, rolePermissions } from "../lib/permissions";
import { csv } from "../lib/queries";
const schema: FormSchema = {
  fields: [
    { key: "name", type: "text", label: "نام", required: true, maxLength: 10 },
    { key: "remote", type: "select", label: "همکاری", options: ["yes", "no"] },
    {
      key: "tools",
      type: "text",
      label: "ابزار",
      required: true,
      visibleWhen: { field: "remote", equals: "yes" },
    },
    {
      key: "interests",
      type: "checkboxGroup",
      label: "حوزه",
      options: ["a", "b", "c"],
      max: 2,
    },
    { key: "hours", type: "number", label: "ساعت", min: 3, max: 168 },
    {
      key: "rows",
      type: "repeater",
      label: "سوابق",
      max: 3,
      children: [
        { key: "title", type: "text", label: "عنوان", required: true },
      ],
    },
  ],
};
describe("schema-driven validation", () => {
  it("accepts valid schema and strips unknown/hidden fields", () => {
    schemaValidator.parse(schema);
    expect(
      validateAnswers(schema, {
        name: "مهدی",
        remote: "no",
        tools: "hidden",
        injected: "secret",
      }),
    ).toEqual({ name: "مهدی", remote: "no" });
  });
  it("requires visible conditional fields", () =>
    expect(() =>
      validateAnswers(schema, { name: "مهدی", remote: "yes" }),
    ).toThrow());
  it("enforces max selection and rejects duplicates", () => {
    for (const v of [["a", "b", "c"], ["a", "a"], ["unknown"]])
      expect(() =>
        validateAnswers(schema, { name: "مهدی", interests: v }),
      ).toThrow();
  });
  it("validates every repeatable row with nested paths", () => {
    try {
      validateAnswers(schema, {
        name: "مهدی",
        rows: [{ title: "ok" }, { title: "" }],
      });
      throw new Error("accepted");
    } catch (e) {
      expect(String(e)).toContain("title");
    }
  });
  it("accepts generic repeating rows", () =>
    expect(
      validateAnswers(schema, {
        name: "مهدی",
        rows: [{ title: "a" }, { title: "b" }],
      }).rows,
    ).toHaveLength(2));
  it("enforces number bounds and Persian digits", () => {
    expect(validateAnswers(schema, { name: "مهدی", hours: "۳" }).hours).toBe(3);
    for (const hours of ["NaN", 2, 169, {}, true])
      expect(() => validateAnswers(schema, { name: "مهدی", hours })).toThrow();
  });
  it("validates national ID checksum and repeated digits", () => {
    expect(validNationalId("0013547899")).toBe(false);
    expect(validNationalId("1111111111")).toBe(false);
    expect(normalizeDigits("۱۲٣٤")).toBe("1234");
  });
  it("rejects cycles, duplicate keys and nested repeaters", () => {
    expect(() =>
      schemaValidator.parse({ fields: [schema.fields[0], schema.fields[0]] }),
    ).toThrow();
    expect(() =>
      schemaValidator.parse({
        fields: [
          {
            key: "a",
            label: "a",
            type: "text",
            visibleWhen: { field: "b", equals: "yes" },
          },
        ],
      }),
    ).toThrow();
    expect(() =>
      schemaValidator.parse({
        fields: [
          {
            key: "a",
            label: "a",
            type: "repeater",
            children: [
              {
                key: "b",
                label: "b",
                type: "repeater",
                children: [schema.fields[0]],
              },
            ],
          },
        ],
      }),
    ).toThrow();
  });
  it("rejects impossible dates", () =>
    expect(() =>
      validateAnswers(
        { fields: [{ key: "d", label: "تاریخ", type: "date" }] },
        { d: "2025-02-30" },
      ),
    ).toThrow());
  it("accepts valid ISO dates", () =>
    expect(
      validateAnswers(
        { fields: [{ key: "d", label: "تاریخ", type: "date", required: true }] },
        { d: "2025-03-20" },
      ).d,
    ).toBe("2025-03-20"));
  it("requires true commitment", () =>
    expect(() =>
      validateAnswers(
        {
          fields: [
            { key: "c", label: "تعهد", type: "checkbox", required: true },
          ],
        },
        { c: false },
      ),
    ).toThrow());
  it("keeps historical schemas independent", () => {
    const v1 = structuredClone(schema);
    const v2 = structuredClone(v1);
    v2.fields[0].maxLength = 2;
    expect(() => validateAnswers(v1, { name: "مهدی" })).not.toThrow();
    expect(() => validateAnswers(v2, { name: "مهدی" })).toThrow();
  });
});
describe("workflow and authorization", () => {
  it("cannot skip review or reopen a final decision", () => {
    expect(() => assertTransition("NEW", "APPROVED")).toThrow();
    expect(() => assertTransition("APPROVED", "UNDER_REVIEW")).toThrow();
    expect(() => assertTransition("UNDER_REVIEW", "APPROVED")).not.toThrow();
  });
  it("requires correction and rejection reasons", () => {
    expect(() => assertTransition("UNDER_REVIEW", "REJECTED")).toThrow();
    expect(() =>
      assertTransition("UNDER_REVIEW", "NEEDS_CORRECTION", "   "),
    ).toThrow();
    expect(() =>
      assertTransition("NEEDS_CORRECTION", "UNDER_REVIEW"),
    ).not.toThrow();
  });
  it("viewer cannot approve, export, access answers or users", () => {
    for (const p of [
      "requests.approve",
      "reports.export",
      "submissions.read",
      "users.manage",
    ])
      expect(hasPermission(rolePermissions.VIEWER, p)).toBe(false);
  });
  it("operator cannot approve or see restricted submissions", () => {
    expect(hasPermission(rolePermissions.OPERATOR, "requests.approve")).toBe(
      false,
    );
    expect(
      hasPermission(rolePermissions.OPERATOR, "submissions.sensitive"),
    ).toBe(false);
  });
});
describe("export safety", () => {
  it("escapes spreadsheet formula injection", () => {
    expect(csv([["=CMD()", "+1", "@evil", "normal"]])).toContain('"\'=CMD()"');
  });
});
describe("member form updates", () => {
  it("member schema is valid and has new education/sacrifice options", () => {
    const s = schemaValidator.parse(memberPersonalInfo);
    const edu = s.fields.find((f) => f.key === "educationHistory");
    expect(edu?.children?.map((c) => c.key)).toEqual(
      expect.arrayContaining(["major", "specialization"]),
    );
    const kind = s.fields
      .find((f) => f.key === "sacrificeRecords")
      ?.children?.find((c) => c.key === "kind");
    expect(kind?.options).toEqual(
      expect.arrayContaining(["سابقه بسیج", "سابقه جبهه"]),
    );
  });
  it("patch adds fields to an older schema once and is idempotent", () => {
    const old: FormSchema = {
      fields: [
        {
          key: "educationHistory",
          type: "repeater",
          label: "مدارج تحصیلی",
          children: [
            { key: "degree", type: "select", label: "مقطع", options: ["دیپلم"] },
            { key: "institution", type: "text", label: "مؤسسه" },
          ],
        },
        {
          key: "sacrificeRecords",
          type: "repeater",
          label: "سوابق ایثارگری",
          children: [
            {
              key: "kind",
              type: "select",
              label: "نوع",
              options: ["جانباز", "شهید", "آزاده"],
            },
          ],
        },
      ],
    };
    const first = patchMemberFormSchema(old);
    expect(first.changes.length).toBe(4);
    expect(first.schema.fields[0].children?.map((c) => c.key)).toEqual([
      "degree",
      "major",
      "specialization",
      "institution",
    ]);
    expect(schemaValidator.safeParse(first.schema).success).toBe(true);
    expect(patchMemberFormSchema(first.schema).changes).toEqual([]);
    expect(old.fields[0].children?.length).toBe(2);
  });
  it("lists changed field labels between two answers", () => {
    const s = schemaValidator.parse(memberPersonalInfo);
    const before = { firstName: "علی", nationalId: "0012345678", skills: "" };
    const after = { firstName: "علی", nationalId: "0084575948", city: "قم" };
    expect(changedFieldLabels(s, before, after)).toEqual(["کدملی", "نام شهرستان"]);
  });
});
