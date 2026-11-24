"use client";
import { useState, useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  UsersRound,
  ContactRound,
  Plus,
  ArrowUpLeft,
  Search,
  Download,
  MoreHorizontal,
} from "lucide-react";
import { api, errorMessage, statuses } from "@/lib/client";
import { date, toPersianDigits } from "@/lib/utils";
import { Button } from "./ui/button";
import { useUser, PasswordForm } from "./shell";
import { FormBuilder, type EditableForm } from "./form-builder";
import { FormRenderer } from "./form-renderer";
import {
  type Field,
  type FormSchema,
  decorative,
  isVisible,
} from "@/lib/forms/engine";
import { transitions } from "@/lib/workflow";
import { PersianDateInput } from "./persian-date-input";
import { useConfirm } from "./confirm-dialog";
import { auditActionLabel, auditEntityLabel } from "@/lib/audit-labels";
import { roleLabels } from "@/lib/permissions";
interface Person {
  id: string;
  firstName: string;
  lastName: string;
  nationalId?: string;
  mobile?: string;
  email?: string;
}
interface RequestRow {
  id: string;
  requestNumber: string;
  membershipNumber?: string;
  status: string;
  createdAt: string;
  person: Person;
  interviewCompleted: boolean;
  internalNote?: string;
  assignedTo?: string;
}
interface MemberRow {
  id: string;
  membershipNumber: string;
  status: string;
  expirationDate: string;
  membershipType: string;
  startDate?: string;
  person: Person & { photoId?: string };
  registrarName?: string;
  registrarNotes?: string;
  formMembershipStatus?: string;
}
interface UserRow {
  id: string;
  username: string;
  displayName: string;
  disabled: boolean;
  roles: { roleId: string }[];
}
interface AuditRow {
  id: string;
  action: string;
  entity: string;
  entityId: string;
  actorId: string;
  actorName?: string | null;
  actorUsername?: string | null;
  createdAt: string;
  ip: string;
}
interface PageData<T> {
  items: T[];
  total?: number;
  page?: number;
  size?: number;
}
function useLoad<T>(path: string) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState("");
  const [rev, setRev] = useState(0);
  useEffect(() => {
    let active = true;
    setError("");
    api<T>(path)
      .then((d) => {
        if (active) setData(d);
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      });
    return () => {
      active = false;
    };
  }, [path, rev]);
  return { data, error, reload: () => setRev((v) => v + 1) };
}
export function Badge({ status }: { status: string }) {
  return (
    <span className={"badge " + status}>{statuses[status] ?? status}</span>
  );
}
function Head({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="row">{children}</div>
    </div>
  );
}
function Table({
  headers,
  children,
  empty,
}: {
  headers: string[];
  children: ReactNode;
  empty: boolean;
}) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
      {empty && <div className="empty">هنوز رکوردی برای نمایش وجود ندارد.</div>}
    </div>
  );
}
function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        className={wide ? "modal modal-wide" : "modal"}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="row between" style={{ marginBottom: 20 }}>
          <h2>{title}</h2>
          <Button variant="ghost" onClick={onClose}>
            بستن ×
          </Button>
        </div>
        {children}
      </section>
    </div>
  );
}
function Pager({
  page,
  setPage,
  total = 0,
}: {
  page: number;
  setPage: (v: number) => void;
  total?: number;
}) {
  return (
    <div className="pagination">
      <small>
        {total.toLocaleString("fa-IR")} رکورد · صفحه{" "}
        {page.toLocaleString("fa-IR")}
      </small>
      <div className="row">
        <Button
          size="sm"
          variant="outline"
          disabled={page <= 1}
          onClick={() => setPage(page - 1)}
        >
          قبلی
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={page * 20 >= total}
          onClick={() => setPage(page + 1)}
        >
          بعدی
        </Button>
      </div>
    </div>
  );
}
function useAction(reload: () => void) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return {
    error,
    setError,
    busy,
    run: async (path: string, payload: unknown) => {
      setBusy(true);
      setError("");
      try {
        await api(path, payload);
        reload();
        return true;
      } catch (e) {
        setError(errorMessage(e));
        return false;
      } finally {
        setBusy(false);
      }
    },
  };
}
function Dashboard() {
  const { data, error } = useLoad<Record<string, unknown>>("dashboard");
  const user = useUser();
  const stats = [
    ["members", "کل اعضا", UsersRound],
    ["active", "اعضای فعال", ContactRound],
    ["expired", "عضویت منقضی", ContactRound],
  ] as const;
  return (
    <>
      <Head
        title="نمای کلی عضویت"
        description="وضعیت اعضا و عملیات روزانه در یک نگاه"
      >
        {user.permissions.includes("submissions.write") && (
          <Link
            className="button primary"
            href="/submit/membership-application"
          >
            <Plus size={17} />
            ثبت اطلاعات فردی اعضا
          </Link>
        )}
      </Head>
      {error && <div className="error">{error}</div>}
      <div className="stats">
        {stats.map(([key, label, Icon]) => (
          <div className="stat" key={key}>
            <Icon size={20} />
            <span>{label}</span>
            <strong>
              {data ? Number(data[key] ?? 0).toLocaleString("fa-IR") : "—"}
            </strong>
          </div>
        ))}
      </div>
      <div className="grid two">
        <section className="panel">
          <div className="row between">
            <h2>مسیر عضویت</h2>
            <small>ثبت مستقیم به‌عنوان عضو</small>
          </div>
          <div className="grid two">
            {[
              ["۱", "ثبت اطلاعات فردی"],
              ["۲", "ثبت ملاحظات"],
              ["۳", "ثبت به‌عنوان عضو"],
            ].map(([n, s]) => (
              <div className="step" key={n}>
                <strong>مرحله {n}</strong>
                {s}
              </div>
            ))}
          </div>
        </section>
        <section className="panel">
          <h2>آخرین فعالیت‌ها</h2>
          {Array.isArray(data?.activities) && data.activities.length ? (
            <Table
              headers={["فعالیت", "انجام‌دهنده", "زمان"]}
              empty={false}
            >
              {(data.activities as AuditRow[]).map((a) => (
                <tr key={a.id}>
                  <td>{a.action}</td>
                  <td>{a.actorName ? a.actorName : "عمومی / سیستم"}</td>
                  <td>
                    <small>{date(a.createdAt)}</small>
                  </td>
                </tr>
              ))}
            </Table>
          ) : (
            <div className="empty">رویدادی برای نمایش در دسترس نیست.</div>
          )}
        </section>
      </div>
    </>
  );
}
function Forms() {
  const { data, error, reload } = useLoad<PageData<EditableForm>>("forms");
  const [edit, setEdit] = useState<EditableForm | null | undefined>();
  const user = useUser();
  const action = useAction(reload);
  const { confirm } = useConfirm();
  if (!user.permissions.includes("forms.write"))
    return (
      <div className="error">
        ساخت و ویرایش فرم فقط برای مدیر مجاز است. برای تکمیل فرم به بخش «ثبت
        فرم» بروید.
      </div>
    );
  if (edit !== undefined)
    return (
      <FormBuilder
        form={edit ?? undefined}
        onClose={() => {
          setEdit(undefined);
          reload();
        }}
      />
    );
  return (
    <>
      <Head
        title="فرم‌ساز"
        description="طراحی، نسخه‌بندی و انتشار فرم‌ها — فقط مدیران"
      >
        <Button onClick={() => setEdit(null)}>
          <Plus size={17} />
          فرم جدید
        </Button>
      </Head>
      {(error || action.error) && (
        <div className="error">{error || action.error}</div>
      )}
      <div className="grid two">
        {data?.items.map((f) => (
          <section className="panel" key={f.id}>
            <div className="row between">
              <h2>{f.title}</h2>
              <Badge status={f.status} />
            </div>
            <p className="muted">
              /{f.slug} · آخرین نسخه {f.versions[0]?.number ?? 0}
            </p>
            <div className="row">
              <Button variant="outline" onClick={() => setEdit(f)}>
                ویرایش و طراحی
              </Button>
              <Button
                variant="ghost"
                onClick={async () => {
                  const ok = await confirm({
                    title: "بایگانی فرم",
                    message:
                      "فرم بایگانی شود؟ ثبت پاسخ جدید متوقف خواهد شد.",
                    confirmLabel: "بایگانی شود",
                    tone: "danger",
                  });
                  if (ok) void action.run("forms/archive", { id: f.id });
                }}
              >
                بایگانی
              </Button>
            </div>
          </section>
        ))}
      </div>
      {!data?.items.length && (
        <div className="panel empty">فرمی در دسترس نیست.</div>
      )}
    </>
  );
}
function SubmitForm({ slug }: { slug: string }) {
  const user = useUser();
  const [done, setDone] = useState("");
  const { data, error } = useLoad<{
    title: string;
    version: { id: string; schema: FormSchema };
  }>("public-form/" + slug);
  if (!user.permissions.includes("submissions.write"))
    return <div className="error">به این بخش دسترسی ندارید.</div>;
  if (done)
    return (
      <>
        <Head title={data?.title ?? "ثبت فرم"} description="نتیجه ثبت" />
        <div className="success" role="status">
          {done}
        </div>
        <div className="row" style={{ marginTop: 16 }}>
          <Button onClick={() => setDone("")}>ثبت مورد دیگر</Button>
          <Link className="button btn-outline" href="/members">
            مشاهده اعضا
          </Link>
        </div>
      </>
    );
  return (
    <>
      <Head
        title={data?.title ?? "ثبت فرم"}
        description="تکمیل و ثبت اطلاعات عضو"
      />
      {error && <div className="error">{error}</div>}
      <div className="panel">
        <FillForm
          slug={slug}
          onDone={() =>
            setDone("اطلاعات با موفقیت ثبت شد و فرد به‌عنوان عضو ذخیره گردید.")
          }
        />
      </div>
    </>
  );
}
function FillForm({
  slug,
  requestId,
  memberId,
  onDone,
  supersedesId,
  initial,
}: {
  slug: string;
  requestId?: string;
  memberId?: string;
  onDone: () => void;
  supersedesId?: string;
  initial?: Record<string, unknown>;
}) {
  const { data, error } = useLoad<{
    version: { id: string; schema: FormSchema };
  }>("public-form/" + slug);
  return (
    <>
      {error && <div className="error">{error}</div>}
      {data && (
        <FormRenderer
          schema={data.version.schema}
          initial={initial}
          slug={slug}
          onSubmit={async (answers) => {
            await api("submit", {
              versionId: data.version.id,
              answers,
              ...(requestId ? { requestId } : {}),
              ...(memberId ? { memberId } : {}),
              ...(supersedesId ? { supersedesId } : {}),
            });
            onDone();
          }}
        />
      )}
    </>
  );
}
interface SubmissionRow {
  submission: {
    id: string;
    data: Record<string, unknown>;
    createdAt: string;
    supersedesId?: string;
    version: {
      number: number;
      schema: FormSchema;
      form: { title: string; slug: string };
    };
  };
}
interface RequestDetail extends RequestRow {
  submissions: SubmissionRow[];
  hiddenSubmissions: number;
  history: {
    id: string;
    fromStatus: string;
    toStatus: string;
    createdAt: string;
    note: string;
  }[];
}
const HIDDEN_ANSWER_KEYS = new Set([
  "secCommit",
  "consentText",
  "consent",
  "feeCommitment",
  "commitmentDate",
  "feeAccepted",
  "signatureStatus",
  "notice",
  "intro",
]);
function Answers({
  fields,
  data,
}: {
  fields: Field[];
  data: Record<string, unknown>;
}) {
  return (
    <div className="grid two">
      {fields.map((f) => {
        if (HIDDEN_ANSWER_KEYS.has(f.key)) return null;
        if (!isVisible(f, data)) return null;
        if (decorative(f))
          return (
            <div className="form-section" key={f.key}>
              {f.type === "description" ? (
                <p className="muted" style={{ whiteSpace: "pre-wrap" }}>
                  {f.label}
                </p>
              ) : (
                <h3>{f.label}</h3>
              )}
            </div>
          );
        const v = data[f.key];
        return (
          <div
            key={f.key}
            className={f.type === "repeater" ? "form-field wide" : "form-field"}
          >
            <label>{f.label}</label>
            {f.type === "repeater" && Array.isArray(v) ? (
              v.map((row, i) => (
                <div className="repeat-row" key={i}>
                  <Answers
                    fields={f.children ?? []}
                    data={row as Record<string, unknown>}
                  />
                </div>
              ))
            ) : f.type === "image" &&
              (typeof v === "string" || Array.isArray(v)) ? (
              <div className="image-thumbs">
                {(typeof v === "string" ? [v] : (v as string[])).map((id) => (
                  <a
                    key={id}
                    className="image-thumb"
                    href={"/api/files/" + id}
                    target="_blank"
                    rel="noreferrer"
                    title="مشاهده تصویر"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={"/api/files/" + id} alt="" />
                  </a>
                ))}
              </div>
            ) : f.type === "file" &&
              (typeof v === "string" || Array.isArray(v)) ? (
              <ul className="file-list">
                {(typeof v === "string" ? [v] : (v as string[])).map(
                  (id, i) => (
                    <li key={id}>
                      <a
                        href={"/api/files/" + id}
                        target="_blank"
                        rel="noreferrer"
                      >
                        مدرک {toPersianDigits(i + 1)}
                      </a>
                    </li>
                  ),
                )}
              </ul>
            ) : (
              <div className="detail-value">
                {typeof v === "boolean"
                  ? v
                    ? "بله"
                    : "خیر"
                  : f.type === "date" && typeof v === "string" && v
                    ? date(v)
                    : Array.isArray(v)
                      ? toPersianDigits(v.join("، "))
                      : v == null || v === ""
                        ? "—"
                        : toPersianDigits(String(v))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
function OpsMenu({
  items,
}: {
  items: { label: string; onClick: () => void }[];
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    function place() {
      const r = btnRef.current?.getBoundingClientRect();
      if (!r) return;
      const width = 200;
      const left = Math.min(
        Math.max(8, r.right - width),
        window.innerWidth - width - 8,
      );
      setPos({ top: r.bottom + 4, left });
    }
    place();
    function onDoc(e: MouseEvent) {
      if (
        btnRef.current?.contains(e.target as Node) ||
        (e.target as HTMLElement)?.closest?.(".ops-menu-panel")
      )
        return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div className="ops-menu">
      <button
        ref={btnRef}
        type="button"
        className="ops-menu-trigger"
        aria-label="عملیات"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <MoreHorizontal size={18} />
      </button>
      {open &&
        createPortal(
          <div
            className="ops-menu-panel"
            style={{ top: pos.top, left: pos.left }}
            role="menu"
          >
            {items.map((item) => (
              <button
                type="button"
                key={item.label}
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  item.onClick();
                }}
              >
                {item.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
function RequestView({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, error, reload } = useLoad<RequestDetail>("request/" + id);
  const forms = useLoad<PageData<EditableForm>>("forms");
  const [fill, setFill] = useState<{ slug: string; supersedesId?: string }>();
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [assigned, setAssigned] = useState("");
  const action = useAction(reload);
  const user = useUser();
  const { confirm } = useConfirm();
  useEffect(() => {
    if (data) {
      setNote(data.internalNote ?? "");
      setAssigned(data.assignedTo ?? "");
    }
  }, [data]);
  if (!data)
    return <div className="panel">{error || "در حال دریافت درخواست…"}</div>;
  return (
    <>
      <Head
        title={data.requestNumber}
        description={data.person.firstName + " " + data.person.lastName}
      >
        <Button variant="outline" onClick={onClose}>
          بازگشت به فهرست
        </Button>
      </Head>
      {(error || action.error) && (
        <div className="error">{error || action.error}</div>
      )}
      <section className="panel">
        <div className="row between">
          <h2>وضعیت درخواست</h2>
          <Badge status={data.status} />
        </div>
        <p>
          کد ملی: <span dir="ltr">{data.person.nationalId ?? "—"}</span> · تلفن:{" "}
          <span dir="ltr">{data.person.mobile ?? "—"}</span>
        </p>
        <p>مصاحبه: {data.interviewCompleted ? "تکمیل شده" : "تکمیل نشده"}</p>
        {user.permissions.includes("requests.write") && (
          <>
            <label>دلیل تغییر وضعیت (برای رد یا اصلاح الزامی)</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <div className="row" style={{ marginTop: 12 }}>
              {(transitions[data.status] ?? [])
                .filter(
                  (s) =>
                    !["APPROVED", "REJECTED"].includes(s) ||
                    user.permissions.includes("requests.approve"),
                )
                .map((s) => (
                  <Button
                    variant={s === "APPROVED" ? "default" : "outline"}
                    key={s}
                    disabled={action.busy}
                    onClick={async () => {
                      const ok = await confirm({
                        title: "تغییر وضعیت درخواست",
                        message:
                          "وضعیت به «" + statuses[s] + "» تغییر کند؟",
                        confirmLabel: "تغییر وضعیت",
                        tone:
                          s === "REJECTED" || s === "CANCELLED"
                            ? "danger"
                            : "default",
                      });
                      if (ok)
                        void action.run("requests/transition", {
                          id,
                          expected: data.status,
                          status: s,
                          reason,
                        });
                    }}
                  >
                    {statuses[s]}
                  </Button>
                ))}
            </div>
          </>
        )}
      </section>
      {user.permissions.includes("requests.write") && (
        <section className="panel">
          <h2>یادداشت و مسئول بررسی</h2>
          <div className="grid two">
            <label>
              یادداشت داخلی
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
            <label>
              شناسه کاربر مسئول
              <input
                dir="ltr"
                value={assigned}
                onChange={(e) => setAssigned(e.target.value)}
              />
              <small>از صفحه کاربران بردارید؛ خالی یعنی بدون مسئول.</small>
            </label>
          </div>
          <Button
            disabled={action.busy}
            variant="outline"
            onClick={() =>
              action.run("requests/note", {
                id,
                internalNote: note,
                assignedTo: assigned || null,
              })
            }
          >
            ذخیره
          </Button>
        </section>
      )}
      <section className="panel">
        <div className="row between">
          <h2>فرم‌های ثبت‌شده</h2>
          {["NEW", "UNDER_REVIEW", "NEEDS_CORRECTION"].includes(data.status) &&
            user.permissions.includes("submissions.write") && (
              <select
                style={{ maxWidth: 300 }}
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value) setFill({ slug: e.target.value });
                  e.target.value = "";
                }}
              >
                <option value="">+ تکمیل فرم دیگر / مصاحبه</option>
                {forms.data?.items
                  .filter((f) => f.status === "PUBLISHED")
                  .map((f) => (
                    <option key={f.id} value={f.slug}>
                      {f.title}
                    </option>
                  ))}
              </select>
            )}
        </div>
        {data.hiddenSubmissions > 0 && (
          <div className="notice">
            {data.hiddenSubmissions} پاسخ با دسترسی محدود پنهان شده است.
          </div>
        )}
        {data.submissions.map(({ submission: s }) => (
          <details
            key={s.id}
            style={{ borderTop: "1px solid #edf0f3", padding: "15px 0" }}
          >
            <summary>
              {s.version.form.title} · نسخه {s.version.number} ·{" "}
              {date(s.createdAt)} {s.supersedesId ? "· اصلاحیه" : ""}
            </summary>
            <div style={{ marginTop: 20 }}>
              <Answers fields={s.version.schema.fields} data={s.data} />
              {["NEW", "UNDER_REVIEW", "NEEDS_CORRECTION"].includes(
                data.status,
              ) &&
                user.permissions.includes("submissions.write") && (
                  <Button
                    variant="outline"
                    onClick={() =>
                      setFill({ slug: s.version.form.slug, supersedesId: s.id })
                    }
                  >
                    ثبت پاسخ اصلاحی جدید
                  </Button>
                )}
            </div>
          </details>
        ))}
      </section>
      <section className="panel">
        <h2>تاریخچه بررسی</h2>
        <div className="timeline">
          {data.history.map((h) => (
            <p key={h.id}>
              <Badge status={h.toStatus} /> <small>{date(h.createdAt)}</small>
              {h.note && <span> · {h.note}</span>}
            </p>
          ))}
        </div>
      </section>
      {fill && (
        <Modal title="ثبت فرم تکمیلی" onClose={() => setFill(undefined)}>
          <FillForm
            requestId={id}
            slug={fill.slug}
            supersedesId={fill.supersedesId}
            onDone={() => {
              setFill(undefined);
              reload();
            }}
          />
        </Modal>
      )}
    </>
  );
}
interface MemberDetail {
  id: string;
  membershipNumber: string;
  membershipType: string;
  status: string;
  startDate: string;
  expirationDate: string;
  person: Person & { photoId?: string; nationalId?: string; mobile?: string };
  registrarName: string;
  registrarNotes: string;
  primarySubmission: {
    id: string;
    data: Record<string, unknown>;
    createdAt: string;
    version: {
      number: number;
      schema: FormSchema;
      form: { title: string; slug: string };
    };
  };
  submissions: SubmissionRow[];
  hiddenSubmissions: number;
  history: {
    id: string;
    fromStatus: string;
    toStatus: string;
    createdAt: string;
    note: string;
  }[];
}
function MemberView({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, error } = useLoad<MemberDetail>("member/" + id);
  if (!data)
    return <div className="panel">{error || "در حال دریافت پرونده…"}</div>;
  const submission = data.primarySubmission;
  return (
    <>
      <Head
        title={data.membershipNumber}
        description={data.person.firstName + " " + data.person.lastName}
      >
        <Button variant="outline" onClick={onClose}>
          بازگشت به فهرست
        </Button>
      </Head>
      {error && <div className="error">{error}</div>}
      <section className="panel">
        <div className="row between">
          <h2>خلاصه پرونده</h2>
          <Badge status={data.status} />
        </div>
        <div className="grid two">
          <div className="form-field">
            <label>کد عضویت</label>
            <div className="detail-value">
              {toPersianDigits(data.membershipNumber)}
            </div>
          </div>
          <div className="form-field">
            <label>ثبت‌کننده</label>
            <div className="detail-value">{data.registrarName}</div>
          </div>
          <div className="form-field">
            <label>کد ملی</label>
            <div className="detail-value">
              {data.person.nationalId
                ? toPersianDigits(data.person.nationalId)
                : "—"}
            </div>
          </div>
          <div className="form-field">
            <label>تلفن</label>
            <div className="detail-value">
              {data.person.mobile ? toPersianDigits(data.person.mobile) : "—"}
            </div>
          </div>
          <div className="form-field">
            <label>تاریخ ثبت</label>
            <div className="detail-value">{date(data.startDate)}</div>
          </div>
          <div className="form-field">
            <label>انقضا</label>
            <div className="detail-value">{date(data.expirationDate)}</div>
          </div>
        </div>
        {(data.registrarNotes ||
          (typeof submission.data.registrarNotes === "string" &&
            submission.data.registrarNotes)) && (
          <div className="form-field" style={{ marginTop: 12 }}>
            <label>ثبت ملاحظات</label>
            <div className="detail-value">
              {(typeof submission.data.registrarNotes === "string" &&
                submission.data.registrarNotes) ||
                data.registrarNotes}
            </div>
          </div>
        )}
        {data.person.photoId && (
          <div className="image-thumbs" style={{ marginTop: 12 }}>
            <a
              className="image-thumb"
              href={"/api/files/" + data.person.photoId}
              target="_blank"
              rel="noreferrer"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={"/api/files/" + data.person.photoId} alt="" />
            </a>
          </div>
        )}
      </section>
      <section className="panel">
        <h2>{submission.version.form.title}</h2>
        <Answers fields={submission.version.schema.fields} data={submission.data} />
      </section>
      {!!data.history.length && (
        <section className="panel">
          <h2>تاریخچه وضعیت</h2>
          {data.history.map((h) => (
            <div
              className="row between"
              key={h.id}
              style={{ padding: "8px 0", borderBottom: "1px solid #edf0f3" }}
            >
              <span>
                {statuses[h.toStatus] ?? h.toStatus}
                {h.note ? " — " + h.note : ""}
              </span>
              <small>{date(h.createdAt)}</small>
            </div>
          ))}
        </section>
      )}
    </>
  );
}
function Records() {
  const [draft, setDraft] = useState({
    q: "",
    status: "",
    sort: "desc",
    createdFrom: "",
    createdTo: "",
    gender: "",
    membershipStatus: "",
    province: "",
    city: "",
  });
  const [applied, setApplied] = useState(draft);
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<string>();
  const [photoEdit, setPhotoEdit] = useState<MemberRow>();
  const [statusEdit, setStatusEdit] = useState<MemberRow>();
  const [fullEdit, setFullEdit] = useState<MemberDetail>();
  const [memberStatus, setMemberStatus] = useState("ACTIVE");
  const [dormantReason, setDormantReason] = useState("");
  const [dormantDetail, setDormantDetail] = useState("");
  const filtersDirty =
    JSON.stringify(draft) !== JSON.stringify(applied);
  const listPath =
    "members?q=" +
    encodeURIComponent(applied.q) +
    "&status=" +
    encodeURIComponent(applied.status) +
    "&page=" +
    page +
    "&sort=" +
    encodeURIComponent(applied.sort) +
    "&createdFrom=" +
    encodeURIComponent(applied.createdFrom) +
    "&createdTo=" +
    encodeURIComponent(applied.createdTo) +
    "&gender=" +
    encodeURIComponent(applied.gender) +
    "&membershipStatus=" +
    encodeURIComponent(applied.membershipStatus) +
    "&province=" +
    encodeURIComponent(applied.province) +
    "&city=" +
    encodeURIComponent(applied.city);
  const { data, error, reload } = useLoad<PageData<MemberRow>>(listPath);
  const user = useUser();
  const action = useAction(() => {
    setPhotoEdit(undefined);
    setStatusEdit(undefined);
    setFullEdit(undefined);
    reload();
  });
  async function openFullEdit(row: MemberRow) {
    const d = await api<MemberDetail>("member/" + row.id);
    setFullEdit(d);
  }
  if (detail)
    return (
      <MemberView
        id={detail}
        onClose={() => {
          setDetail(undefined);
          reload();
        }}
      />
    );
  return (
    <>
      <Head title="اعضای حزب" description="جستجو، بررسی و مدیریت اطلاعات اعضا">
        {user.permissions.includes("submissions.write") && (
          <Link
            className="button primary"
            href="/submit/membership-application"
          >
            <Plus size={16} />
            ثبت عضو جدید
          </Link>
        )}
        {user.permissions.includes("reports.export") && (
          <Link className="button btn-outline" href="/reports">
            <Download size={16} />
            خروجی اکسل
          </Link>
        )}
      </Head>
      {(error || action.error) && (
        <div className="error">{error || action.error}</div>
      )}
      <div className="panel">
        <form
          className="filters filters-advanced"
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
            setApplied({
              ...draft,
              q: draft.q.trim(),
              province: draft.province.trim(),
              city: draft.city.trim(),
            });
          }}
        >
          <input
            placeholder="جستجو نام، کد عضویت، کد ملی یا موبایل…"
            value={draft.q}
            onChange={(e) => setDraft((d) => ({ ...d, q: e.target.value }))}
          />
          <select
            value={draft.status}
            onChange={(e) =>
              setDraft((d) => ({ ...d, status: e.target.value }))
            }
          >
            <option value="">همه وضعیت‌ها</option>
            {["ACTIVE", "EXPIRED", "SUSPENDED", "CANCELLED"].map((s) => (
              <option key={s} value={s}>
                {statuses[s]}
              </option>
            ))}
          </select>
          <select
            value={draft.sort}
            onChange={(e) => setDraft((d) => ({ ...d, sort: e.target.value }))}
          >
            <option value="desc">جدیدترین</option>
            <option value="asc">قدیمی‌ترین</option>
          </select>
          <label className="filter-date">
            از تاریخ
            <PersianDateInput
              value={draft.createdFrom}
              onChange={(v) =>
                setDraft((d) => ({ ...d, createdFrom: v }))
              }
            />
          </label>
          <label className="filter-date">
            تا تاریخ
            <PersianDateInput
              value={draft.createdTo}
              onChange={(v) => setDraft((d) => ({ ...d, createdTo: v }))}
            />
          </label>
          <select
            value={draft.gender}
            onChange={(e) =>
              setDraft((d) => ({ ...d, gender: e.target.value }))
            }
          >
            <option value="">جنسیت (همه)</option>
            <option value="مرد">مرد</option>
            <option value="زن">زن</option>
          </select>
          <select
            value={draft.membershipStatus}
            onChange={(e) =>
              setDraft((d) => ({ ...d, membershipStatus: e.target.value }))
            }
          >
            <option value="">وضعیت عضویت فرم</option>
            <option value="فعال">فعال</option>
            <option value="راکد">راکد</option>
          </select>
          <input
            placeholder="استان"
            value={draft.province}
            onChange={(e) =>
              setDraft((d) => ({ ...d, province: e.target.value }))
            }
          />
          <input
            placeholder="شهرستان"
            value={draft.city}
            onChange={(e) => setDraft((d) => ({ ...d, city: e.target.value }))}
          />
          <div className="filter-actions">
            <Button
              type="submit"
              className={filtersDirty ? "filter-apply-pending" : undefined}
            >
              <Search size={17} />
              اعمال فیلتر
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                const empty = {
                  q: "",
                  status: "",
                  sort: "desc",
                  createdFrom: "",
                  createdTo: "",
                  gender: "",
                  membershipStatus: "",
                  province: "",
                  city: "",
                };
                setDraft(empty);
                setApplied(empty);
                setPage(1);
              }}
            >
              پاک کردن
            </Button>
          </div>
        </form>
        <Table
          headers={[
            "کد عضویت",
            "نام و نام خانوادگی",
            "وضعیت",
            "ثبت‌کننده",
            "تاریخ ثبت",
            "عملیات",
          ]}
          empty={!data?.items.length}
        >
          {data?.items.map((r) => (
            <tr
              key={r.id}
              className="row-clickable"
              onDoubleClick={() => setDetail(r.id)}
              title="برای مشاهده جزئیات دوبار کلیک کنید"
            >
              <td>{toPersianDigits(r.membershipNumber)}</td>
              <td>
                {r.person.firstName} {r.person.lastName}
              </td>
              <td>
                <Badge
                  status={
                    r.status === "ACTIVE" &&
                    new Date(r.expirationDate) < new Date()
                      ? "EXPIRED"
                      : r.status
                  }
                />
              </td>
              <td>{r.registrarName ?? "—"}</td>
              <td>{date(r.startDate ?? r.expirationDate)}</td>
              <td onDoubleClick={(e) => e.stopPropagation()}>
                <OpsMenu
                  items={[
                    {
                      label: "جزئیات کامل پرونده",
                      onClick: () => setDetail(r.id),
                    },
                    ...(user.permissions.includes("members.write")
                      ? [
                          {
                            label: "به‌روزرسانی عکس",
                            onClick: () => setPhotoEdit(r),
                          },
                          {
                            label: "تغییر وضعیت",
                            onClick: () => {
                              setStatusEdit(r);
                              setMemberStatus(
                                r.status === "SUSPENDED"
                                  ? "SUSPENDED"
                                  : "ACTIVE",
                              );
                              setDormantReason("");
                              setDormantDetail("");
                            },
                          },
                          {
                            label: "ویرایش اطلاعات",
                            onClick: () => {
                              void openFullEdit(r).catch((e) => {
                                action.setError(errorMessage(e));
                              });
                            },
                          },
                        ]
                      : []),
                  ]}
                />
              </td>
            </tr>
          ))}
        </Table>
        <Pager page={page} setPage={setPage} total={data?.total} />
      </div>
      {photoEdit && (
        <Modal
          title="به‌روزرسانی عکس"
          onClose={() => setPhotoEdit(undefined)}
        >
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              const d = new FormData(e.currentTarget);
              const photoId = d.get("photoId");
              if (!photoId) return;
              void action.run("members/save", {
                id: photoEdit.id,
                photoId,
              });
            }}
          >
            <ImageUpload name="photoId" label="عکس جدید عضو" />
            {action.error && <div className="error">{action.error}</div>}
            <Button disabled={action.busy}>ذخیره عکس</Button>
          </form>
        </Modal>
      )}
      {statusEdit && (
        <Modal
          title="تغییر وضعیت عضویت"
          onClose={() => setStatusEdit(undefined)}
        >
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              void action.run("members/save", {
                id: statusEdit.id,
                status: memberStatus,
                ...(memberStatus === "SUSPENDED"
                  ? {
                      dormantReason,
                      dormantReasonDetail: dormantDetail,
                    }
                  : {}),
              });
            }}
          >
            <label>
              وضعیت
              <select
                value={memberStatus}
                onChange={(e) => setMemberStatus(e.target.value)}
              >
                <option value="ACTIVE">فعال</option>
                <option value="SUSPENDED">راکد</option>
              </select>
            </label>
            {memberStatus === "SUSPENDED" && (
              <>
                <label>
                  دلیل رکود عضویت
                  <select
                    value={dormantReason}
                    onChange={(e) => setDormantReason(e.target.value)}
                    required
                  >
                    <option value="">انتخاب کنید</option>
                    <option value="فوت">فوت</option>
                    <option value="استعفا">استعفا</option>
                    <option value="لغو عضویت">لغو عضویت</option>
                  </select>
                </label>
                {(dormantReason === "استعفا" ||
                  dormantReason === "لغو عضویت") && (
                  <label>
                    شرح دلیل استعفا / لغو عضویت
                    <textarea
                      value={dormantDetail}
                      onChange={(e) => setDormantDetail(e.target.value)}
                      required
                    />
                  </label>
                )}
              </>
            )}
            {action.error && <div className="error">{action.error}</div>}
            <Button disabled={action.busy}>ذخیره وضعیت</Button>
          </form>
        </Modal>
      )}
      {fullEdit && (
        <Modal
          wide
          title="ویرایش اطلاعات عضو"
          onClose={() => setFullEdit(undefined)}
        >
          <FillForm
            key={fullEdit.primarySubmission.id}
            slug={fullEdit.primarySubmission.version.form.slug}
            memberId={fullEdit.id}
            supersedesId={fullEdit.primarySubmission.id}
            initial={fullEdit.primarySubmission.data}
            onDone={() => {
              setFullEdit(undefined);
              reload();
            }}
          />
        </Modal>
      )}
    </>
  );
}
export function ImageUpload({ name, label }: { name: string; label: string }) {
  const [id, setId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <label>
      {label}
      <input type="hidden" name={name} value={id} />
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          setBusy(true);
          setError("");
          try {
            const d = new FormData();
            d.append("file", f);
            const r = await fetch("/api/upload", { method: "POST", body: d });
            const value = await r.json();
            if (!r.ok) throw new Error(value.error);
            setId(value.id);
          } catch (e) {
            setError(errorMessage(e));
          } finally {
            setBusy(false);
          }
        }}
      />
      <small>{busy ? "در حال بارگذاری…" : id ? "بارگذاری شد." : ""}</small>
      {error && <p className="error">{error}</p>}
    </label>
  );
}
function Users() {
  const { data, error, reload } = useLoad<PageData<UserRow>>("users");
  const [edit, setEdit] = useState<UserRow | null | undefined>();
  const user = useUser();
  const { confirm } = useConfirm();
  const action = useAction(() => {
    setEdit(undefined);
    reload();
  });
  return (
    <>
      <Head
        title="کاربران و دسترسی‌ها"
        description="ایجاد حساب، تعیین نقش و مدیریت وضعیت کاربران"
      >
        <Button onClick={() => setEdit(null)}>
          <Plus size={16} />
          کاربر جدید
        </Button>
      </Head>
      {(error || action.error) && (
        <div className="error">{error || action.error}</div>
      )}
      <div className="panel">
        <Table
          headers={["نام", "نام کاربری", "نقش", "وضعیت", "عملیات"]}
          empty={!data?.items.length}
        >
          {data?.items.map((u) => (
            <tr key={u.id}>
              <td>{u.displayName}</td>
              <td dir="ltr">{u.username}</td>
              <td>
                {u.roles
                  .map((r) => roleLabels[r.roleId] ?? r.roleId)
                  .join("، ")}
              </td>
              <td>{u.disabled ? "غیرفعال" : "فعال"}</td>
              <td>
                <div className="row" style={{ gap: 8 }}>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setEdit(u)}
                  >
                    ویرایش / رمز
                  </Button>
                  {u.id !== user.id && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={action.busy}
                      onClick={async () => {
                        const ok = await confirm({
                          title: "حذف کاربر",
                          message:
                            "کاربر «" +
                            u.displayName +
                            "» برای همیشه حذف شود؟",
                          confirmLabel: "حذف",
                          tone: "danger",
                        });
                        if (!ok) return;
                        void action.run("users/delete", { id: u.id });
                      }}
                    >
                      حذف
                    </Button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </Table>
      </div>
      {edit !== undefined && (
        <Modal
          title={edit ? "ویرایش کاربر" : "کاربر جدید"}
          onClose={() => setEdit(undefined)}
        >
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              const d = new FormData(e.currentTarget);
              void action.run("users/save", {
                ...(edit ? { id: edit.id } : {}),
                username: d.get("username"),
                displayName: d.get("displayName"),
                role: d.get("role"),
                disabled: d.get("disabled") === "on",
                ...(d.get("password") ? { password: d.get("password") } : {}),
              });
            }}
          >
            <label>
              نام نمایشی
              <input
                name="displayName"
                defaultValue={edit?.displayName}
                required
              />
            </label>
            <label>
              نام کاربری
              <input
                name="username"
                dir="ltr"
                defaultValue={edit?.username}
                required
                minLength={3}
              />
            </label>
            <label>
              {edit ? "رمز جدید (خالی: بدون تغییر)" : "رمز عبور اولیه"}
              <input
                type="password"
                name="password"
                autoComplete="new-password"
                minLength={12}
                maxLength={72}
                required={!edit}
              />
            </label>
            <label>
              نقش
              <select
                name="role"
                defaultValue={
                  edit?.roles[0]?.roleId === "SUPER_ADMIN"
                    ? "SUPER_ADMIN"
                    : "REGISTRAR"
                }
              >
                {(["SUPER_ADMIN", "REGISTRAR"] as const).map((r) => (
                  <option key={r} value={r}>
                    {roleLabels[r]}
                  </option>
                ))}
              </select>
            </label>
            <label className="check-label">
              <input
                name="disabled"
                type="checkbox"
                defaultChecked={edit?.disabled}
              />
              غیرفعال
            </label>
            <small>
              تغییر نقش، رمز یا وضعیت، نشست‌های کاربر را باطل می‌کند.
            </small>
            {action.error && <div className="error">{action.error}</div>}
            <Button disabled={action.busy}>ذخیره کاربر</Button>
          </form>
        </Modal>
      )}
    </>
  );
}
function Audit() {
  const [page, setPage] = useState(1);
  const { data, error } = useLoad<PageData<AuditRow>>("audit?page=" + page);
  return (
    <>
      <Head
        title="رویدادهای سامانه"
        description="چه کسی چه کاری انجام داده است"
      />
      {error && <div className="error">{error}</div>}
      <div className="panel">
        <Table
          headers={["زمان", "چه کاری", "روی چه چیزی", "شناسه", "چه کسی", "IP"]}
          empty={!data?.items.length}
        >
          {data?.items.map((a) => (
            <tr key={a.id}>
              <td>{new Date(a.createdAt).toLocaleString("fa-IR")}</td>
              <td>{auditActionLabel(a.action)}</td>
              <td>{auditEntityLabel(a.entity)}</td>
              <td>
                <small dir="ltr">{a.entityId || "—"}</small>
              </td>
              <td>
                {a.actorName ? (
                  <>
                    {a.actorName}
                    {a.actorUsername ? (
                      <small dir="ltr"> · {a.actorUsername}</small>
                    ) : null}
                  </>
                ) : (
                  <small>عمومی / سیستم</small>
                )}
              </td>
              <td dir="ltr">{a.ip || "—"}</td>
            </tr>
          ))}
        </Table>
        <Pager page={page} setPage={setPage} total={data?.total} />
      </div>
    </>
  );
}
function Settings() {
  const { data, error, reload } =
    useLoad<PageData<{ key: string; value: unknown }>>("settings");
  const action = useAction(() => {
    reload();
  });
  return (
    <>
      <Head title="تنظیمات حزب" description="گردش بررسی و تنظیمات عمومی" />
      {(error || action.error) && (
        <div className="error">{error || action.error}</div>
      )}
      <div className="grid two">
        <section className="panel">
          <h2>گردش عضویت</h2>
          {data && (
            <form
              key={JSON.stringify(data)}
              className="stack"
              onSubmit={(e) => {
                e.preventDefault();
                const d = new FormData(e.currentTarget);
                void action.run("settings/save", {
                  organizationName: d.get("organizationName"),
                  requireInterview: d.get("requireInterview") === "on",
                });
              }}
            >
              <label>
                نام حزب
                <input
                  name="organizationName"
                  defaultValue={String(
                    data.items.find((s) => s.key === "organizationName")
                      ?.value ?? "حزب مؤتلفه اسلامی",
                  )}
                  required
                />
              </label>
              <label className="check-label">
                <input
                  type="checkbox"
                  name="requireInterview"
                  defaultChecked={
                    data.items.find((s) => s.key === "requireInterview")
                      ?.value !== false
                  }
                />
                مصاحبه پیش از تأیید الزامی باشد
              </label>
              <Button disabled={action.busy}>ذخیره تنظیمات</Button>
            </form>
          )}
        </section>
        <section className="panel">
          <h2>تغییر رمز عبور</h2>
          <PasswordForm />
        </section>
      </div>
    </>
  );
}
type ExportField = {
  key: string;
  label: string;
  type: string;
  options?: string[];
  children?: { key: string; label: string; type: string; options?: string[] }[];
};
type ExportFilterRow = {
  id: string;
  field: string;
  op: string;
  value: string;
  valueTo: string;
  childKey: string;
};
function Reports() {
  const [forms, setForms] = useState<{ slug: string; title: string }[]>([]);
  const [slug, setSlug] = useState("");
  const [fields, setFields] = useState<ExportField[]>([]);
  const [systemColumns, setSystemColumns] = useState<
    { key: string; label: string }[]
  >([]);
  const [status, setStatus] = useState("");
  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");
  const [filters, setFilters] = useState<ExportFilterRow[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [previewTotal, setPreviewTotal] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    api<{ items: { slug: string; title: string }[] }>("export-forms")
      .then((r) => {
        setForms(r.items);
        if (r.items[0] && !slug) setSlug(r.items[0].slug);
      })
      .catch((e) => setError(errorMessage(e)));
  }, []);
  useEffect(() => {
    if (!slug) return;
    setError("");
    setPreviewTotal(null);
    api<{
      fields: ExportField[];
      systemColumns: { key: string; label: string }[];
    }>("export-meta?slug=" + encodeURIComponent(slug))
      .then((r) => {
        setFields(r.fields);
        setSystemColumns(r.systemColumns);
        const defaults = [
          "_membershipNumber",
          "_firstName",
          "_lastName",
          "_nationalId",
          "_mobile",
          "_requestStatus",
          "membershipDate",
          "membershipStatus",
          "gender",
          "province",
          "city",
        ].filter(
          (k) =>
            r.systemColumns.some((c) => c.key === k) ||
            r.fields.some((f) => f.key === k),
        );
        setColumns(defaults);
        setFilters([]);
      })
      .catch((e) => setError(errorMessage(e)));
  }, [slug]);
  function addFilter() {
    const first = fields[0];
    if (!first) return;
    setFilters((prev) => [
      ...prev,
      {
        id: String(Date.now()) + Math.random(),
        field: first.key,
        op: first.type === "repeater" ? "repeater_any" : "eq",
        value: "",
        valueTo: first.type === "repeater" ? "contains" : "",
        childKey: first.children?.[0]?.key ?? "",
      },
    ]);
  }
  function payload(preview: boolean) {
    return {
      formSlug: slug,
      status,
      createdFrom,
      createdTo,
      preview,
      filters: filters
        .filter((f) => f.field && f.op)
        .map(({ field, op, value, valueTo, childKey }) => ({
          field,
          op,
          value: value || undefined,
          valueTo: valueTo || undefined,
          childKey: childKey || undefined,
        })),
      columns,
    };
  }
  async function runPreview() {
    setBusy(true);
    setError("");
    try {
      const r = await api<{ total: number }>("export-advanced", payload(true));
      setPreviewTotal(r.total);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function runDownload() {
    if (!columns.length) {
      setError("حداقل یک ستون برای خروجی انتخاب کنید.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/export-advanced", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload(false)),
        cache: "no-store",
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "خطا در دریافت خروجی");
      }
      const blob = await res.blob();
      const name =
        res.headers
          .get("Content-Disposition")
          ?.match(/filename="([^"]+)"/)?.[1] ?? "export.csv";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  function toggleColumn(key: string) {
    setColumns((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  }
  function fieldMeta(key: string) {
    return fields.find((f) => f.key === key);
  }
  function opsFor(fieldKey: string) {
    const f = fieldMeta(fieldKey);
    if (!f) return [["eq", "برابر"]];
    if (f.type === "repeater") return [["repeater_any", "در یکی از ردیف‌ها"]];
    if (f.type === "date" || f.type === "number")
      return [
        ["eq", "برابر"],
        ["gte", "بزرگ‌تر یا مساوی"],
        ["lte", "کوچک‌تر یا مساوی"],
        ["between", "بازه"],
        ["empty", "خالی"],
        ["not_empty", "پر"],
      ];
    if (f.type === "checkboxGroup")
      return [
        ["array_contains", "شامل گزینه"],
        ["empty", "خالی"],
        ["not_empty", "پر"],
      ];
    if (
      f.type === "select" ||
      f.type === "radio" ||
      f.type === "searchSelect"
    )
      return [
        ["eq", "برابر"],
        ["neq", "نابرابر"],
        ["empty", "خالی"],
        ["not_empty", "پر"],
      ];
    return [
      ["eq", "برابر"],
      ["contains", "شامل"],
      ["not_contains", "بدون"],
      ["empty", "خالی"],
      ["not_empty", "پر"],
    ];
  }
  return (
    <>
      <Head
        title="خروجی اکسل"
        description="فیلتر پیشرفته روی فیلدهای فرم و دریافت فایل سازگار با Excel"
      />
      {error && <div className="error">{error}</div>}
      <div className="panel export-builder">
        <div className="grid two">
          <label>
            فرم
            <select value={slug} onChange={(e) => setSlug(e.target.value)}>
              {forms.map((f) => (
                <option key={f.slug} value={f.slug}>
                  {f.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            وضعیت عضو
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">همه</option>
              {["ACTIVE", "EXPIRED", "SUSPENDED", "CANCELLED"].map((s) => (
                <option key={s} value={s}>
                  {statuses[s]}
                </option>
              ))}
            </select>
          </label>
          <label className="filter-date">
            تاریخ ثبت از
            <PersianDateInput value={createdFrom} onChange={setCreatedFrom} />
          </label>
          <label className="filter-date">
            تاریخ ثبت تا
            <PersianDateInput value={createdTo} onChange={setCreatedTo} />
          </label>
        </div>
        <h2>فیلترهای فرم</h2>
        <p className="muted">
          مثلاً تاریخ عضویت از ۱۴۰۳، شغل شامل «کارمند»، و ایثارگری از نوع
          «جانباز» را همزمان اعمال کنید.
        </p>
        <div className="export-filters">
          {filters.map((row) => {
            const meta = fieldMeta(row.field);
            const ops = opsFor(row.field);
            const needsValue = !["empty", "not_empty"].includes(row.op);
            return (
              <div className="export-filter-row" key={row.id}>
                <select
                  value={row.field}
                  onChange={(e) => {
                    const field = e.target.value;
                    const m = fieldMeta(field);
                    setFilters((prev) =>
                      prev.map((f) =>
                        f.id === row.id
                          ? {
                              ...f,
                              field,
                              op:
                                m?.type === "repeater" ? "repeater_any" : "eq",
                              childKey: m?.children?.[0]?.key ?? "",
                              value: "",
                              valueTo:
                                m?.type === "repeater" ? "contains" : "",
                            }
                          : f,
                      ),
                    );
                  }}
                >
                  {fields.map((f) => (
                    <option key={f.key} value={f.key}>
                      {f.label}
                    </option>
                  ))}
                </select>
                <select
                  value={row.op}
                  onChange={(e) =>
                    setFilters((prev) =>
                      prev.map((f) =>
                        f.id === row.id ? { ...f, op: e.target.value } : f,
                      ),
                    )
                  }
                >
                  {ops.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
                {row.op === "repeater_any" && meta?.children && (
                  <>
                    <select
                      value={row.childKey}
                      onChange={(e) =>
                        setFilters((prev) =>
                          prev.map((f) =>
                            f.id === row.id
                              ? { ...f, childKey: e.target.value }
                              : f,
                          ),
                        )
                      }
                    >
                      {meta.children.map((c) => (
                        <option key={c.key} value={c.key}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                    <select
                      value={row.valueTo || "contains"}
                      onChange={(e) =>
                        setFilters((prev) =>
                          prev.map((f) =>
                            f.id === row.id
                              ? { ...f, valueTo: e.target.value }
                              : f,
                          ),
                        )
                      }
                    >
                      <option value="contains">شامل</option>
                      <option value="eq">برابر</option>
                    </select>
                  </>
                )}
                {needsValue &&
                  row.op !== "repeater_any" &&
                  (meta?.options &&
                  row.op !== "contains" &&
                  row.op !== "not_contains" ? (
                    <select
                      value={row.value}
                      onChange={(e) =>
                        setFilters((prev) =>
                          prev.map((f) =>
                            f.id === row.id
                              ? { ...f, value: e.target.value }
                              : f,
                          ),
                        )
                      }
                    >
                      <option value="">انتخاب…</option>
                      {meta.options.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  ) : meta?.type === "date" && row.op !== "between" ? (
                    <PersianDateInput
                      value={row.value}
                      onChange={(v) =>
                        setFilters((prev) =>
                          prev.map((f) =>
                            f.id === row.id ? { ...f, value: v } : f,
                          ),
                        )
                      }
                    />
                  ) : (
                    <input
                      value={row.value}
                      placeholder="مقدار"
                      onChange={(e) =>
                        setFilters((prev) =>
                          prev.map((f) =>
                            f.id === row.id
                              ? { ...f, value: e.target.value }
                              : f,
                          ),
                        )
                      }
                    />
                  ))}
                {row.op === "between" &&
                  (meta?.type === "date" ? (
                    <PersianDateInput
                      value={row.valueTo}
                      onChange={(v) =>
                        setFilters((prev) =>
                          prev.map((f) =>
                            f.id === row.id ? { ...f, valueTo: v } : f,
                          ),
                        )
                      }
                    />
                  ) : (
                    <input
                      value={row.valueTo}
                      placeholder="تا"
                      onChange={(e) =>
                        setFilters((prev) =>
                          prev.map((f) =>
                            f.id === row.id
                              ? { ...f, valueTo: e.target.value }
                              : f,
                          ),
                        )
                      }
                    />
                  ))}
                {row.op === "repeater_any" &&
                  (() => {
                    const child = meta?.children?.find(
                      (c) => c.key === row.childKey,
                    );
                    if (child?.options)
                      return (
                        <select
                          value={row.value}
                          onChange={(e) =>
                            setFilters((prev) =>
                              prev.map((f) =>
                                f.id === row.id
                                  ? { ...f, value: e.target.value }
                                  : f,
                              ),
                            )
                          }
                        >
                          <option value="">انتخاب…</option>
                          {child.options.map((o) => (
                            <option key={o} value={o}>
                              {o}
                            </option>
                          ))}
                        </select>
                      );
                    return (
                      <input
                        value={row.value}
                        placeholder="مقدار"
                        onChange={(e) =>
                          setFilters((prev) =>
                            prev.map((f) =>
                              f.id === row.id
                                ? { ...f, value: e.target.value }
                                : f,
                            ),
                          )
                        }
                      />
                    );
                  })()}
                <Button
                  size="sm"
                  variant="ghost"
                  type="button"
                  onClick={() =>
                    setFilters((prev) => prev.filter((f) => f.id !== row.id))
                  }
                >
                  حذف
                </Button>
              </div>
            );
          })}
        </div>
        <div className="row" style={{ marginBottom: 18 }}>
          <Button type="button" variant="outline" onClick={addFilter}>
            + افزودن فیلتر
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => void runPreview()}
          >
            شمارش نتایج
          </Button>
          {previewTotal != null && (
            <strong>
              {previewTotal.toLocaleString("fa-IR")} رکورد مطابق فیلتر
            </strong>
          )}
        </div>
        <h2>ستون‌های خروجی</h2>
        <div className="export-columns">
          {systemColumns.map((c) => (
            <label key={c.key} className="check-label">
              <input
                type="checkbox"
                checked={columns.includes(c.key)}
                onChange={() => toggleColumn(c.key)}
              />
              {c.label}
            </label>
          ))}
          {fields.map((f) => (
            <label key={f.key} className="check-label">
              <input
                type="checkbox"
                checked={columns.includes(f.key)}
                onChange={() => toggleColumn(f.key)}
              />
              {f.label}
            </label>
          ))}
        </div>
        <div className="row" style={{ marginTop: 20 }}>
          <Button disabled={busy || !slug} onClick={() => void runDownload()}>
            <Download size={16} />
            دریافت فایل اکسل (CSV)
          </Button>
        </div>
      </div>
      <div className="grid two">
        <section className="panel">
          <h2>خروجی ساده اعضا</h2>
          <p className="muted">فقط کد عضویت، نام، وضعیت و تاریخ.</p>
          <a className="button btn-outline" href="/api/export?type=members">
            <Download size={16} />
            دریافت سریع
          </a>
        </section>
      </div>
      <p className="notice">
        هر خروجی حداکثر ۸٬۰۰۰ رکورد است. خروجی‌ها محدود شده‌اند (۱۰ بار در
        ساعت) تا سرور تحت فشار نرود. فایل CSV را مستقیم در Excel باز کنید.
      </p>
    </>
  );
}
export function Admin({
  section,
  slug,
}: {
  section: string;
  slug?: string;
}) {
  const user = useUser();
  const required: Record<string, string> = {
    dashboard: "dashboard.read",
    submit: "submissions.write",
    forms: "forms.write",
    members: "members.read",
    users: "users.manage",
    reports: "reports.export",
    audit: "audit.read",
    settings: "settings.manage",
  };
  if (!user.permissions.includes(required[section]))
    return <div className="error">به این بخش دسترسی ندارید.</div>;
  switch (section) {
    case "dashboard":
      return <Dashboard />;
    case "submit":
      return slug ? (
        <SubmitForm slug={slug} />
      ) : (
        <div className="error">فرم مشخص نشده است.</div>
      );
    case "forms":
      return <Forms />;
    case "members":
      return <Records />;
    case "users":
      return <Users />;
    case "reports":
      return <Reports />;
    case "audit":
      return <Audit />;
    case "settings":
      return <Settings />;
    default:
      return <p>صفحه یافت نشد.</p>;
  }
}
