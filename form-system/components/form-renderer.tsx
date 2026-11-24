"use client";
import { useState } from "react";
import {
  useForm,
  Controller,
  type Resolver,
  type FieldErrors,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  type FormSchema,
  type Field,
  isVisible,
  decorative,
  answerSchema,
} from "@/lib/forms/engine";
import { Button } from "./ui/button";
import { errorMessage } from "@/lib/client";
import { toPersianDigits } from "@/lib/utils";
import { PersianDateInput } from "./persian-date-input";
import { SearchSelect } from "./search-select";
import { jobTypes } from "@/lib/forms/job-types";

function fieldError(
  errors: FieldErrors<Record<string, unknown>>,
  path: string,
): string | undefined {
  const parts = path.split(".");
  let cur: unknown = errors;
  for (const part of parts) {
    if (!cur || typeof cur !== "object") return;
    cur = (cur as Record<string, unknown>)[part];
  }
  if (
    cur &&
    typeof cur === "object" &&
    "message" in cur &&
    typeof (cur as { message: unknown }).message === "string"
  )
    return (cur as { message: string }).message;
}

function collectIssues(
  fields: Field[],
  errors: FieldErrors<Record<string, unknown>>,
  base = "",
  values: Record<string, unknown> = {},
): { path: string; label: string; message: string }[] {
  const out: { path: string; label: string; message: string }[] = [];
  for (const f of fields) {
    if (decorative(f) || !isVisible(f, values)) continue;
    const path = base ? base + "." + f.key : f.key;
    if (f.type === "repeater") {
      const rows = (
        Array.isArray(values[f.key]) ? values[f.key] : []
      ) as Record<string, unknown>[];
      const top = fieldError(errors, path);
      if (top) out.push({ path, label: f.label, message: top });
      rows.forEach((row, i) => {
        out.push(
          ...collectIssues(f.children ?? [], errors, path + "." + i, row),
        );
      });
      continue;
    }
    const message = fieldError(errors, path);
    if (message) out.push({ path, label: f.label, message });
  }
  return out;
}

export function FormRenderer({
  schema,
  onSubmit,
  initial = {},
  preview = false,
  slug,
}: {
  schema: FormSchema;
  onSubmit: (v: Record<string, unknown>) => Promise<void>;
  initial?: Record<string, unknown>;
  preview?: boolean;
  slug?: string;
}) {
  const {
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting, isSubmitted },
  } = useForm<Record<string, unknown>>({
    defaultValues: initial,
    resolver: zodResolver(answerSchema(schema)) as Resolver<
      Record<string, unknown>
    >,
  });
  const values = watch();
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(0);
  const [fileNames, setFileNames] = useState<Record<string, string>>({});
  const issues = collectIssues(schema.fields, errors, "", values);
  const showErrors = isSubmitted || issues.length > 0;

  function render(
    fields: Field[],
    base = "",
    local: Record<string, unknown> = values,
  ): React.ReactNode {
    return fields.map((f) => {
      if (!isVisible(f, local)) return null;
      const name = base ? base + "." + f.key : f.key;
      if (decorative(f))
        return (
          <div className="form-section" key={name}>
            {f.type === "description" ? (
              <p className="muted" style={{ whiteSpace: "pre-wrap" }}>
                {f.label}
              </p>
            ) : (
              <h3>{f.label}</h3>
            )}
          </div>
        );
      if (f.type === "repeater") {
        const rows = (
          Array.isArray(local[f.key]) ? local[f.key] : []
        ) as Record<string, unknown>[];
        const err = showErrors ? fieldError(errors, name) : undefined;
        return (
          <div
            className={"form-field wide" + (err ? " has-error" : "")}
            key={name}
          >
            <label>
              {f.label}
              {f.required ? " *" : ""}
            </label>
            {rows.map((row, i) => (
              <div className="repeat-row" key={i}>
                <div className="row between">
                  <small>ردیف {toPersianDigits(i + 1)}</small>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setValue(
                        name,
                        rows.filter((_, n) => n !== i),
                      )
                    }
                  >
                    حذف ردیف
                  </Button>
                </div>
                <div className="grid two">
                  {render(f.children ?? [], name + "." + i, row)}
                </div>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              disabled={rows.length >= Math.min(f.max ?? 30, 30)}
              onClick={() => setValue(name, [...rows, {}])}
            >
              + افزودن ردیف
            </Button>
            {err ? <p className="field-error">{err}</p> : null}
          </div>
        );
      }
      const err = showErrors ? fieldError(errors, name) : undefined;
      return (
        <div
          key={name}
          className={
            "form-field " +
            (["textarea", "checkboxGroup", "multiSelect", "checkbox", "image", "file", "repeater"].includes(
              f.type,
            )
              ? "wide "
              : "") +
            (err ? "has-error" : "")
          }
        >
          <label htmlFor={name}>
            {f.label}
            {f.required && <span style={{ color: "#b35b4a" }}> *</span>}
          </label>
          <Controller
            name={name}
            control={control}
            defaultValue={
              f.type === "checkbox"
                ? false
                : ["multiSelect", "checkboxGroup"].includes(f.type) ||
                    (["image", "file"].includes(f.type) && (f.max ?? 1) > 1)
                  ? []
                  : ""
            }
            render={({ field }) => {
              if (f.type === "textarea")
                return (
                  <textarea
                    {...field}
                    value={toPersianDigits(String(field.value ?? ""))}
                    onChange={(e) =>
                      field.onChange(toPersianDigits(e.target.value))
                    }
                    id={name}
                    placeholder={f.placeholder}
                    aria-invalid={!!err}
                    className={err ? "input-invalid" : undefined}
                  />
                );
              if (f.type === "checkbox")
                return (
                  <label className="check-label">
                    <input
                      type="checkbox"
                      id={name}
                      checked={field.value === true}
                      onChange={(e) => field.onChange(e.target.checked)}
                      aria-invalid={!!err}
                    />{" "}
                    تأیید می‌کنم
                  </label>
                );
              if (["radio", "multiSelect", "checkboxGroup"].includes(f.type))
                return (
                  <div
                    className={
                      "option-group" + (err ? " input-invalid" : "")
                    }
                  >
                    {f.options?.map((o) => (
                      <label className="check-label" key={o}>
                        <input
                          type={f.type === "radio" ? "radio" : "checkbox"}
                          name={name}
                          checked={
                            f.type === "radio"
                              ? field.value === o
                              : Array.isArray(field.value) &&
                                field.value.includes(o)
                          }
                          onChange={(e) =>
                            field.onChange(
                              f.type === "radio"
                                ? o
                                : e.target.checked
                                  ? [
                                      ...(Array.isArray(field.value)
                                        ? field.value
                                        : []),
                                      o,
                                    ]
                                  : (Array.isArray(field.value)
                                      ? field.value
                                      : []
                                    ).filter((v) => v !== o),
                            )
                          }
                        />
                        {o}
                      </label>
                    ))}
                  </div>
                );
              if (f.type === "select")
                return (
                  <select
                    {...field}
                    id={name}
                    value={String(field.value ?? "")}
                    aria-invalid={!!err}
                    className={err ? "input-invalid" : undefined}
                  >
                    <option value="">انتخاب کنید</option>
                    {f.options?.map((o) => (
                      <option key={o}>{o}</option>
                    ))}
                  </select>
                );
              if (f.type === "searchSelect")
                return (
                  <SearchSelect
                    id={name}
                    value={String(field.value ?? "")}
                    options={
                      f.optionsSource === "jobTypes" ? jobTypes : (f.options ?? [])
                    }
                    placeholder={f.placeholder ?? "جستجو و انتخاب نوع شغل…"}
                    invalid={!!err}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                  />
                );
              if (["image", "file"].includes(f.type)) {
                const isDoc = f.type === "file";
                const multi = (f.max ?? 1) > 1;
                const ids = multi
                  ? Array.isArray(field.value)
                    ? (field.value as string[])
                    : []
                  : typeof field.value === "string" && field.value
                    ? [field.value]
                    : [];
                const limit = Math.min(f.max ?? 1, isDoc ? 50 : 20);
                const uploadOne = async (file: File) => {
                  const data = new FormData();
                  data.append("file", file);
                  const params = new URLSearchParams();
                  if (slug) params.set("form", slug);
                  if (isDoc) params.set("kind", "document");
                  const q = params.toString();
                  const res = await fetch(
                    "/api/upload" + (q ? "?" + q : ""),
                    { method: "POST", body: data },
                  );
                  const result = await res.json();
                  if (!res.ok) throw new Error(result.error);
                  setFileNames((prev) => ({
                    ...prev,
                    [result.id]: result.name || file.name,
                  }));
                  return result.id as string;
                };
                const removeId = (id: string) => {
                  field.onChange(multi ? ids.filter((x) => x !== id) : "");
                  setFileNames((prev) => {
                    const next = { ...prev };
                    delete next[id];
                    return next;
                  });
                };
                return (
                  <div>
                    {ids.length < limit && (
                      <input
                        id={name}
                        type="file"
                        multiple={isDoc && multi}
                        accept={
                          isDoc
                            ? ".pdf,.jpg,.jpeg,.png,.webp,.gif,.doc,.docx,.xls,.xlsx,.zip,.txt,application/pdf,image/*"
                            : "image/jpeg,image/png,image/webp"
                        }
                        disabled={preview}
                        aria-invalid={!!err}
                        className={err ? "input-invalid" : undefined}
                        onChange={async (e) => {
                          const list = Array.from(e.target.files ?? []);
                          e.target.value = "";
                          if (!list.length) return;
                          const room = limit - ids.length;
                          const batch = list.slice(0, room);
                          setUploading((n) => n + batch.length);
                          try {
                            const uploaded: string[] = [];
                            for (const file of batch) {
                              uploaded.push(await uploadOne(file));
                            }
                            if (multi)
                              field.onChange([...ids, ...uploaded]);
                            else field.onChange(uploaded[0] ?? "");
                          } catch (e) {
                            setError(errorMessage(e));
                          } finally {
                            setUploading((n) => n - batch.length);
                          }
                        }}
                      />
                    )}
                    <small>
                      {isDoc
                        ? "هر فایل حداکثر ۵۰ مگابایت · PDF، تصویر، Word، Excel، Zip، متن"
                        : "JPEG / PNG / WebP، حداکثر ۵ مگابایت"}
                      {multi && !isDoc
                        ? ` — تا ${toPersianDigits(limit)} تصویر`
                        : ""}
                      {ids.length
                        ? ` · ${toPersianDigits(ids.length)} فایل`
                        : ""}
                    </small>
                    {!!ids.length &&
                      (isDoc ? (
                        <ul className="file-list">
                          {ids.map((id) => (
                            <li key={id}>
                              <a
                                href={"/api/files/" + id}
                                target="_blank"
                                rel="noreferrer"
                              >
                                {fileNames[id] || "دانلود مدرک"}
                              </a>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => removeId(id)}
                              >
                                حذف
                              </Button>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <div className="image-thumbs">
                          {ids.map((id) => (
                            <div className="image-thumb" key={id}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={"/api/files/" + id} alt="" />
                              <button
                                type="button"
                                aria-label="حذف تصویر"
                                onClick={() => removeId(id)}
                              >
                                ×
                              </button>
                            </div>
                          ))}
                        </div>
                      ))}
                  </div>
                );
              }
              if (f.type === "date")
                return (
                  <PersianDateInput
                    id={name}
                    value={String(field.value ?? "")}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    invalid={!!err}
                  />
                );
              const numericLike = [
                "phone",
                "nationalId",
                "number",
                "text",
              ].includes(f.type);
              return (
                <input
                  {...field}
                  value={
                    numericLike || f.type === "email"
                      ? toPersianDigits(String(field.value ?? ""))
                      : String(field.value ?? "")
                  }
                  onChange={(e) =>
                    field.onChange(
                      numericLike || f.type === "email"
                        ? toPersianDigits(e.target.value)
                        : e.target.value,
                    )
                  }
                  id={name}
                  type="text"
                  inputMode={
                    f.type === "number" ||
                    f.type === "phone" ||
                    f.type === "nationalId"
                      ? "numeric"
                      : f.type === "email"
                        ? "email"
                        : undefined
                  }
                  placeholder={
                    f.placeholder
                      ? toPersianDigits(f.placeholder)
                      : undefined
                  }
                  aria-invalid={!!err}
                  className={err ? "input-invalid" : undefined}
                />
              );
            }}
          />
          {err ? <p className="field-error">{err}</p> : null}
        </div>
      );
    });
  }

  return (
    <form
      noValidate
      onSubmit={handleSubmit(async (data) => {
        setError("");
        try {
          await onSubmit(data);
        } catch (e) {
          setError(errorMessage(e));
        }
      })}
    >
      <div className="grid two">{render(schema.fields)}</div>
      <div className="row" style={{ marginTop: 25 }}>
        <Button type="submit" disabled={isSubmitting || uploading > 0}>
          {uploading
            ? "در حال بارگذاری…"
            : isSubmitting
              ? "در حال ثبت…"
              : preview
                ? "بررسی اعتبار فرم"
                : "ثبت اطلاعات"}
        </Button>
        <small>فیلدهای ستاره‌دار الزامی هستند.</small>
      </div>
      {error ? (
        <div className="error" role="alert" style={{ marginTop: 16 }}>
          {error}
        </div>
      ) : null}
      {issues.length > 0 ? (
        <div className="error form-errors" role="alert">
          <strong>لطفاً این موارد را اصلاح کنید:</strong>
          <ul>
            {issues.map((i) => (
              <li key={i.path}>
                <a href={"#" + i.path}>{i.label}</a>
                {" — "}
                {i.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </form>
  );
}
