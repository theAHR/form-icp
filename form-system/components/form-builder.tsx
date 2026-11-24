"use client";
import { useState } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  arrayMove,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Trash2, Plus, Eye, Save, Send } from "lucide-react";
import {
  type Field,
  type FormSchema,
  fieldTypes,
  schemaValidator,
} from "@/lib/forms/engine";
import { FormRenderer } from "./form-renderer";
import { Button } from "./ui/button";
import { api, errorMessage } from "@/lib/client";
import { useConfirm } from "./confirm-dialog";
export interface EditableForm {
  id: string;
  title: string;
  slug: string;
  purpose: string;
  public: boolean;
  sensitive: boolean;
  status: string;
  versions: {
    id: string;
    number: number;
    title: string;
    slug: string;
    purpose: string;
    public: boolean;
    sensitive: boolean;
    schema: FormSchema;
    publishedAt: string | null;
  }[];
}
const labels: Record<string, string> = {
  text: "متن کوتاه",
  textarea: "متن بلند",
  number: "عدد",
  email: "ایمیل",
  phone: "تلفن",
  nationalId: "کد ملی",
  date: "تاریخ",
  select: "فهرست کشویی",
  searchSelect: "انتخاب با جستجو",
  multiSelect: "چندانتخابی",
  radio: "تک‌انتخابی",
  checkbox: "تأیید",
  checkboxGroup: "گروه انتخاب",
  file: "فایل تصویری",
  image: "تصویر",
  section: "بخش",
  heading: "عنوان",
  description: "توضیحات",
  repeater: "گروه تکرارشونده",
};
function SortableField({
  field,
  selected,
  onSelect,
  onDelete,
}: {
  field: Field;
  selected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: field.key });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={"canvas-field " + (selected ? "selected" : "")}
    >
      <button
        className="drag-handle"
        type="button"
        aria-label="جابه‌جایی فیلد"
        {...attributes}
        {...listeners}
      >
        <GripVertical size={18} />
      </button>
      <div className="field-main" onClick={onSelect}>
        <strong>
          {field.label}
          {field.required ? " *" : ""}
        </strong>
        <small> · {labels[field.type]}</small>
        <div className="field-placeholder" />
      </div>
      <button
        type="button"
        className="drag-handle"
        aria-label="حذف فیلد"
        onClick={onDelete}
      >
        <Trash2 size={16} />
      </button>
    </div>
  );
}
export function FormBuilder({
  form,
  onClose,
}: {
  form?: EditableForm;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(
    form?.versions[0]?.title ?? form?.title ?? "فرم جدید",
  );
  const [slug, setSlug] = useState(form?.versions[0]?.slug ?? form?.slug ?? "");
  const [purpose, setPurpose] = useState(
    form?.versions[0]?.purpose ?? form?.purpose ?? "GENERAL",
  );
  const [isPublic, setPublic] = useState(
    form?.versions[0]?.public ?? form?.public ?? false,
  );
  const [sensitive, setSensitive] = useState(
    form?.versions[0]?.sensitive ?? form?.sensitive ?? false,
  );
  const [fields, setFields] = useState<Field[]>(
    form?.versions[0]?.schema.fields ?? [],
  );
  const [selected, setSelected] = useState<number>(0);
  const [child, setChild] = useState<number | null>(null);
  const [preview, setPreview] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const { alert } = useConfirm();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const parent = fields[selected];
  const f = child === null ? parent : parent?.children?.[child];
  const update = (patch: Partial<Field>) =>
    setFields((fs) =>
      fs.map((field, i) =>
        i !== selected
          ? field
          : child === null
            ? { ...field, ...patch }
            : {
                ...field,
                children: field.children?.map((c, j) =>
                  j === child ? { ...c, ...patch } : c,
                ),
              },
      ),
    );
  function add(type: Field["type"]) {
    const field: Field = {
      key: "field_" + crypto.randomUUID().slice(0, 8),
      type,
      label: labels[type],
      ...(type === "repeater"
        ? {
            children: [{ key: "description", type: "text", label: "شرح" }],
            max: 10,
          }
        : {}),
      ...(["select", "radio", "multiSelect", "checkboxGroup"].includes(type)
        ? { options: ["گزینه اول", "گزینه دوم"] }
        : {}),
    };
    setFields([...fields, field]);
    setSelected(fields.length);
    setChild(null);
  }
  async function save(publish: boolean) {
    setError("");
    setBusy(true);
    try {
      schemaValidator.parse({ fields });
      await api("forms/save", {
        ...(form ? { id: form.id } : {}),
        title,
        slug,
        purpose,
        public: isPublic,
        sensitive,
        schema: { fields },
        publish,
        expectedVersion: form?.versions[0]?.id ?? null,
      });
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-head">
        <div>
          <h1>{form ? "ویرایش فرم" : "ساخت فرم"}</h1>
          <p>
            هر ذخیره، یک نسخه مستقل می‌سازد. انتشار، نسخه فعال را تغییر می‌دهد.
          </p>
        </div>
        <Button variant="outline" onClick={onClose}>
          بازگشت
        </Button>
      </div>
      {error && <div className="error">{error}</div>}
      <div className="panel">
        <div className="grid three">
          <div>
            <label>عنوان فرم</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <label>نشانی انگلیسی</label>
            <input
              dir="ltr"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="membership-application"
            />
          </div>
          <div>
            <label>کاربرد</label>
            <select
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
            >
              <option value="APPLICATION">درخواست عضویت</option>
              <option value="INTERVIEW">مصاحبه</option>
              <option value="GENERAL">تکمیلی</option>
            </select>
          </div>
        </div>
        <div className="row" style={{ marginTop: 16 }}>
          <label className="check-label">
            <input
              type="checkbox"
              checked={sensitive}
              onChange={(e) => setSensitive(e.target.checked)}
            />{" "}
            دسترسی محدود به پاسخ‌ها
          </label>
        </div>
      </div>
      <div className="row" style={{ marginBottom: 18 }}>
        <Button variant="outline" onClick={() => setPreview(!preview)}>
          <Eye size={16} />
          {preview ? "بازگشت به طراحی" : "پیش‌نمایش"}
        </Button>
        <Button variant="outline" disabled={busy} onClick={() => save(false)}>
          <Save size={16} />
          ذخیره پیش‌نویس
        </Button>
        <Button disabled={busy} onClick={() => save(true)}>
          <Send size={16} />
          انتشار نسخه
        </Button>
      </div>
      {preview ? (
        <div className="panel">
          <h2>{title}</h2>
          <FormRenderer
            key={JSON.stringify(fields)}
            schema={{ fields }}
            preview
            onSubmit={async () => {
              await alert({
                title: "پیش‌نمایش فرم",
                message: "اعتبارسنجی فرم موفق بود؛ پاسخی ذخیره نشد.",
              });
            }}
          />
        </div>
      ) : (
        <div className="builder">
          <div className="panel">
            <h3>کتابخانه فیلد</h3>
            <div className="library">
              {fieldTypes.map((type) => (
                <Button
                  size="sm"
                  variant="ghost"
                  key={type}
                  onClick={() => add(type)}
                >
                  <Plus size={13} />
                  {labels[type]}
                </Button>
              ))}
            </div>
          </div>
          <div className="panel">
            <div className="row between">
              <h3>بوم فرم</h3>
              <small>{fields.length} فیلد</small>
            </div>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={({ active, over }) => {
                if (over && active.id !== over.id) {
                  const a = fields.findIndex((f) => f.key === active.id),
                    b = fields.findIndex((f) => f.key === over.id);
                  setFields(arrayMove(fields, a, b));
                  setSelected(b);
                  setChild(null);
                }
              }}
            >
              <SortableContext
                items={fields.map((f) => f.key)}
                strategy={verticalListSortingStrategy}
              >
                {fields.map((field, i) => (
                  <SortableField
                    key={field.key}
                    field={field}
                    selected={selected === i}
                    onSelect={() => {
                      setSelected(i);
                      setChild(null);
                    }}
                    onDelete={() => {
                      setFields(fields.filter((_, j) => i !== j));
                      setSelected(0);
                      setChild(null);
                    }}
                  />
                ))}
              </SortableContext>
            </DndContext>
            {!fields.length && (
              <div className="empty">اولین فیلد را از کتابخانه اضافه کنید.</div>
            )}
          </div>
          <div className="panel properties">
            <h3>ویژگی‌های فیلد</h3>
            {f ? (
              <>
                {child !== null && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setChild(null)}
                  >
                    بازگشت به گروه
                  </Button>
                )}
                <div className="field">
                  <label>عنوان</label>
                  <textarea
                    value={f.label}
                    onChange={(e) => update({ label: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>کلید یکتا (انگلیسی)</label>
                  <input
                    dir="ltr"
                    value={f.key}
                    onChange={(e) => update({ key: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label className="check-label">
                    <input
                      type="checkbox"
                      checked={f.required ?? false}
                      onChange={(e) => update({ required: e.target.checked })}
                    />
                    الزامی
                  </label>
                </div>
                <div className="field">
                  <label>متن راهنما</label>
                  <input
                    value={f.placeholder ?? ""}
                    onChange={(e) => update({ placeholder: e.target.value })}
                  />
                </div>
                {["select", "radio", "multiSelect", "checkboxGroup"].includes(
                  f.type,
                ) && (
                  <div className="field">
                    <label>گزینه‌ها؛ هر خط یک گزینه</label>
                    <textarea
                      value={f.options?.join("\n") ?? ""}
                      onChange={(e) =>
                        update({ options: e.target.value.split("\n") })
                      }
                    />
                  </div>
                )}
                <div className="grid two">
                  {(["min", "max", "minLength", "maxLength"] as const).map(
                    (k) => (
                      <div className="field" key={k}>
                        <label>
                          {
                            {
                              min: "حداقل مقدار / تعداد",
                              max: "حداکثر مقدار / تعداد",
                              minLength: "حداقل طول",
                              maxLength: "حداکثر طول",
                            }[k]
                          }
                        </label>
                        <input
                          type="number"
                          value={f[k] ?? ""}
                          onChange={(e) =>
                            update({
                              [k]:
                                e.target.value === ""
                                  ? undefined
                                  : Number(e.target.value),
                            })
                          }
                        />
                      </div>
                    ),
                  )}
                </div>
                <div className="field">
                  <label>الگوی اعتبارسنجی</label>
                  <select
                    value={f.pattern ?? ""}
                    onChange={(e) =>
                      update({
                        pattern: (e.target.value ||
                          undefined) as Field["pattern"],
                      })
                    }
                  >
                    <option value="">بدون الگو</option>
                    <option value="postalCode">کدپستی ۱۰رقمی</option>
                    <option value="digits">فقط رقم</option>
                  </select>
                </div>
                {child === null && (
                  <div className="field">
                    <label>نگاشت به مشخصات فرد</label>
                    <select
                      value={f.personField ?? ""}
                      onChange={(e) =>
                        update({
                          personField: (e.target.value ||
                            undefined) as Field["personField"],
                        })
                      }
                    >
                      <option value="">بدون نگاشت</option>
                      {[
                        "firstName",
                        "lastName",
                        "fatherName",
                        "nationalId",
                        "birthDate",
                        "mobile",
                        "email",
                      ].map((o) => (
                        <option key={o}>{o}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="field">
                  <label>نمایش شرطی: کلید فیلد قبلی</label>
                  <input
                    dir="ltr"
                    value={f.visibleWhen?.field ?? ""}
                    onChange={(e) =>
                      update({
                        visibleWhen: e.target.value
                          ? {
                              field: e.target.value,
                              equals: f.visibleWhen?.equals ?? "",
                            }
                          : undefined,
                      })
                    }
                  />
                </div>
                {f.visibleWhen && (
                  <div className="field">
                    <label>برابر با</label>
                    <input
                      value={
                        Array.isArray(f.visibleWhen.equals)
                          ? f.visibleWhen.equals.join("،")
                          : f.visibleWhen.equals
                      }
                      onChange={(e) =>
                        update({
                          visibleWhen: {
                            field: f.visibleWhen!.field,
                            equals: e.target.value.includes("،")
                              ? e.target.value
                                  .split("،")
                                  .map((s) => s.trim())
                                  .filter(Boolean)
                              : e.target.value,
                          },
                        })
                      }
                    />
                  </div>
                )}
                {f.type === "repeater" && (
                  <div>
                    <h3>فیلدهای گروه</h3>
                    {f.children?.map((c, j) => (
                      <div className="row" key={j}>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setChild(j)}
                        >
                          {c.label}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            update({
                              children: f.children?.filter((_, i) => i !== j),
                            })
                          }
                        >
                          حذف
                        </Button>
                      </div>
                    ))}
                    <select
                      defaultValue=""
                      onChange={(e) => {
                        if (e.target.value)
                          update({
                            children: [
                              ...(f.children ?? []),
                              {
                                key: "item_" + crypto.randomUUID().slice(0, 8),
                                type: e.target.value as Field["type"],
                                label: labels[e.target.value],
                                ...([
                                  "select",
                                  "radio",
                                  "multiSelect",
                                  "checkboxGroup",
                                ].includes(e.target.value)
                                  ? { options: ["گزینه اول"] }
                                  : {}),
                              },
                            ],
                          });
                        e.target.value = "";
                      }}
                    >
                      <option value="">+ افزودن فیلد به گروه</option>
                      {fieldTypes
                        .filter((t) => t !== "repeater")
                        .map((t) => (
                          <option value={t} key={t}>
                            {labels[t]}
                          </option>
                        ))}
                    </select>
                  </div>
                )}
              </>
            ) : (
              <p className="muted">یک فیلد را انتخاب کنید.</p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
