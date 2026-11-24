"use client";
import { useState } from "react";
import { Eye, EyeOff, LogIn } from "lucide-react";
import { api, errorMessage } from "@/lib/client";
import { Button } from "@/components/ui/button";
import { Brand } from "@/components/brand";

export default function Login() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <main className="login-page">
      <div className="login-stage">
        <Brand hero subtitle="ورود امن به پنل مدیریت عضویت" />

        <section className="login-panel" aria-labelledby="login-title">
          <header className="login-panel-head">
            <h1 id="login-title">ورود به سامانه</h1>
            <p>نام کاربری و رمز عبور سازمانی خود را وارد کنید.</p>
          </header>

          {error ? (
            <div className="error login-error" role="alert">
              {error}
            </div>
          ) : null}

          <form
            className="login-form"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              const d = new FormData(e.currentTarget);
              try {
                await api("login", {
                  username: d.get("username"),
                  password: d.get("password"),
                });
                window.location.assign("/dashboard");
              } catch (err) {
                setError(errorMessage(err));
              } finally {
                setBusy(false);
              }
            }}
          >
            <div className="field">
              <label htmlFor="username">نام کاربری</label>
              <input
                id="username"
                name="username"
                dir="ltr"
                autoComplete="username"
                autoFocus
                required
                placeholder="admin"
              />
            </div>

            <div className="field">
              <label htmlFor="password">رمز عبور</label>
              <div className="password-field">
                <input
                  id="password"
                  name="password"
                  dir="ltr"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  placeholder="••••••••••••"
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "مخفی کردن رمز" : "نمایش رمز"}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <Button disabled={busy} className="login-submit">
              {busy ? (
                "در حال ورود…"
              ) : (
                <>
                  <LogIn size={18} />
                  ورود به حساب
                </>
              )}
            </Button>
          </form>

          <p className="login-footnote">
            دسترسی فقط برای کاربران مجاز حزب مؤتلفه اسلامی
          </p>
        </section>
      </div>
    </main>
  );
}
