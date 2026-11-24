"use client";
import { use, useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/client";
import { FormRenderer } from "@/components/form-renderer";
import type { FormSchema } from "@/lib/forms/engine";
import { Brand } from "@/components/brand";
export default function PublicForm({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const [form, setForm] = useState<{
    title: string;
    version: { id: string; number: number; schema: FormSchema };
  }>();
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState("");
  useEffect(() => {
    api<typeof form>("public-form/" + slug)
      .then(setForm)
      .catch((e) => setError(errorMessage(e)));
  }, [slug]);
  return (
    <main className="public-shell">
      <Brand subtitle="درگاه ثبت درخواست عضویت" />
      <div className="panel">
        {error ? (
          <div className="error">{error}</div>
        ) : receipt ? (
          <div className="success">
            <h2>درخواست شما ثبت شد.</h2>
            <p>
              شماره پیگیری: <strong dir="ltr">{receipt}</strong>
            </p>
            <p>برای پیگیری یا اصلاح اطلاعات، با دفتر عضویت تماس بگیرید.</p>
          </div>
        ) : form ? (
          <>
            <div className="page-head">
              <div>
                <h1>{form.title}</h1>
                <p>
                  نسخه {form.version.number} · اطلاعات را با دقت تکمیل کنید.
                </p>
              </div>
            </div>
            <FormRenderer
              schema={form.version.schema}
              slug={slug}
              onSubmit={async (answers) => {
                const r = await api<{ requestNumber: string }>("submit", {
                  versionId: form.version.id,
                  answers,
                });
                setReceipt(r.requestNumber);
              }}
            />
          </>
        ) : (
          <p>در حال دریافت فرم…</p>
        )}
      </div>
    </main>
  );
}
