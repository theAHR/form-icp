"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, errorMessage } from "@/lib/client";

/** مسیر قدیمی /submit — مستقیم به اولین فرم درخواست هدایت می‌شود. */
export default function SubmitIndexRedirect() {
  const router = useRouter();
  const [error, setError] = useState("");
  useEffect(() => {
    api<{
      items: { slug: string; title: string; status: string; purpose: string }[];
    }>("forms")
      .then((r) => {
        const first = r.items.find(
          (f) => f.status === "PUBLISHED" && f.purpose === "APPLICATION",
        );
        if (first) router.replace("/submit/" + first.slug);
        else setError("فرم ثبت منتشرشده‌ای وجود ندارد.");
      })
      .catch((e) => setError(errorMessage(e)));
  }, [router]);
  if (error) return <div className="error">{error}</div>;
  return <div className="panel">در حال انتقال…</div>;
}
