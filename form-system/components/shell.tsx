"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect, createContext, useContext } from "react";
import {
  LayoutDashboard,
  Files,
  FilePenLine,
  ContactRound,
  UserCog,
  ChartNoAxesCombined,
  History,
  Settings,
  LogOut,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { api, errorMessage } from "@/lib/client";
import type { Actor } from "@/lib/auth";
import { Button } from "./ui/button";
import { Brand } from "./brand";
import { ConfirmProvider } from "./confirm-dialog";
const UserContext = createContext<Actor | null>(null);
export const useUser = () => useContext(UserContext)!;

type NavLink = {
  kind: "link";
  href: string;
  label: string;
  Icon: LucideIcon;
  permission: string;
};
type NavForms = {
  kind: "forms";
  label: string;
  Icon: LucideIcon;
  permission: string;
};
type NavEntry = NavLink | NavForms;

const nav: NavEntry[] = [
  {
    kind: "link",
    href: "dashboard",
    label: "داشبورد",
    Icon: LayoutDashboard,
    permission: "dashboard.read",
  },
  {
    kind: "forms",
    label: "ثبت فرم",
    Icon: FilePenLine,
    permission: "submissions.write",
  },
  {
    kind: "link",
    href: "forms",
    label: "فرم‌ساز",
    Icon: Files,
    permission: "forms.write",
  },
  {
    kind: "link",
    href: "members",
    label: "اعضا",
    Icon: ContactRound,
    permission: "members.read",
  },
  {
    kind: "link",
    href: "users",
    label: "کاربران",
    Icon: UserCog,
    permission: "users.manage",
  },
  {
    kind: "link",
    href: "reports",
    label: "خروجی اکسل",
    Icon: ChartNoAxesCombined,
    permission: "reports.export",
  },
  {
    kind: "link",
    href: "audit",
    label: "رویدادها",
    Icon: History,
    permission: "audit.read",
  },
  {
    kind: "link",
    href: "settings",
    label: "تنظیمات",
    Icon: Settings,
    permission: "settings.manage",
  },
];

type SubmitFormLink = { slug: string; title: string };

function topbarLabel(pathname: string, forms: SubmitFormLink[]) {
  if (pathname.startsWith("/submit/")) {
    const slug = pathname.slice("/submit/".length).split("/")[0];
    return forms.find((f) => f.slug === slug)?.title ?? "ثبت فرم";
  }
  if (pathname === "/submit") return "ثبت فرم";
  const link = nav.find(
    (n): n is NavLink => n.kind === "link" && pathname === "/" + n.href,
  );
  return link?.label ?? "سامانه";
}

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [user, setUser] = useState<Actor | null>(null);
  const [error, setError] = useState("");
  const [submitForms, setSubmitForms] = useState<SubmitFormLink[]>([]);
  useEffect(() => {
    api<{ user: Actor | null }>("me")
      .then((r) => {
        if (!r.user) window.location.replace("/login");
        else setUser(r.user);
      })
      .catch((e) => setError(errorMessage(e)));
  }, []);
  useEffect(() => {
    if (!user?.permissions.includes("submissions.write")) return;
    api<{
      items: { slug: string; title: string; status: string; purpose: string }[];
    }>("forms")
      .then((r) =>
        setSubmitForms(
          r.items
            .filter((f) => f.status === "PUBLISHED" && f.purpose === "APPLICATION")
            .map((f) => ({ slug: f.slug, title: f.title })),
        ),
      )
      .catch(() => setSubmitForms([]));
  }, [user]);
  if (error) return <div className="public-shell error">{error}</div>;
  if (!user) return <div className="public-shell">در حال بارگذاری…</div>;
  if (user.mustChangePassword)
    return (
      <ConfirmProvider>
        <main className="public-shell">
          <div className="panel">
            <h1>تغییر رمز عبور اولیه</h1>
            <p>
              برای ادامه، یک رمز شخصی با حداقل ۱۲ نویسه، حرف انگلیسی و عدد تعیین
              کنید.
            </p>
            <PasswordForm />
          </div>
        </main>
      </ConfirmProvider>
    );
  return (
    <ConfirmProvider>
      <UserContext.Provider value={user}>
        <div className="app">
          <aside className="sidebar">
            <div className="sidebar-header">
              <Brand href="/dashboard" compact subtitle="مدیریت عضویت" />
            </div>
            <nav className="nav">
              {nav
                .filter((n) => user.permissions.includes(n.permission))
                .map((item) => {
                  if (item.kind === "forms") {
                    const open = pathname.startsWith("/submit");
                    return (
                      <div className="nav-group" key="forms">
                        <div
                          className={
                            "nav-group-label" + (open ? " active" : "")
                          }
                        >
                          <item.Icon size={19} />
                          {item.label}
                        </div>
                        <div className="nav-sub">
                          {submitForms.map((f) => (
                            <Link
                              key={f.slug}
                              href={"/submit/" + f.slug}
                              className={
                                pathname === "/submit/" + f.slug ? "active" : ""
                              }
                            >
                              {f.title}
                            </Link>
                          ))}
                          {!submitForms.length && (
                            <span className="nav-sub-empty">فرمی نیست</span>
                          )}
                        </div>
                      </div>
                    );
                  }
                  return (
                    <Link
                      key={item.href}
                      href={"/" + item.href}
                      className={pathname === "/" + item.href ? "active" : ""}
                    >
                      <item.Icon size={19} />
                      {item.label}
                    </Link>
                  );
                })}
            </nav>
            <div className="sidebar-bottom">
              <div className="row">
                <ShieldCheck size={19} />
                <small>سامانه داخلی حزب مؤتلفه اسلامی</small>
              </div>
              <Button
                variant="ghost"
                onClick={async () => {
                  await api("logout", {});
                  window.location.replace("/login");
                }}
              >
                <LogOut size={17} /> خروج از حساب
              </Button>
            </div>
          </aside>
          <div>
            <header className="topbar">
              <span className="muted">
                میز کار / {topbarLabel(pathname, submitForms)}
              </span>
              <div className="row">
                <small>
                  {new Date().toLocaleDateString("fa-IR-u-ca-persian", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                  })}
                </small>
                <span className="user-avatar">{user.displayName[0]}</span>
                <span>{user.displayName}</span>
              </div>
            </header>
            <main className="content">{children}</main>
          </div>
        </div>
      </UserContext.Provider>
    </ConfirmProvider>
  );
}
export function PasswordForm() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="stack"
      onSubmit={async (e) => {
        e.preventDefault();
        const d = new FormData(e.currentTarget);
        setBusy(true);
        try {
          await api("password", {
            current: d.get("current"),
            password: d.get("password"),
          });
          window.location.assign("/login");
        } catch (e) {
          setError(errorMessage(e));
        } finally {
          setBusy(false);
        }
      }}
    >
      {error && <div className="error">{error}</div>}
      <label>
        رمز فعلی
        <input
          type="password"
          name="current"
          autoComplete="current-password"
          required
        />
      </label>
      <label>
        رمز جدید
        <input
          type="password"
          name="password"
          autoComplete="new-password"
          minLength={12}
          maxLength={72}
          required
        />
      </label>
      <Button disabled={busy}>ثبت رمز و ورود مجدد</Button>
    </form>
  );
}
