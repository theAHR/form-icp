export async function api<T = Record<string, unknown>>(
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch("/api/" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "خطا در ارتباط با سرور");
  return data as T;
}
export function errorMessage(e: unknown) {
  return e instanceof Error ? e.message : "خطای ناشناخته";
}
export const statuses: Record<string, string> = {
  NEW: "جدید",
  UNDER_REVIEW: "در حال بررسی",
  NEEDS_CORRECTION: "نیازمند اصلاح",
  APPROVED: "تأییدشده",
  REJECTED: "ردشده",
  CANCELLED: "لغوشده",
  ACTIVE: "فعال",
  EXPIRED: "منقضی",
  SUSPENDED: "راکد",
  DRAFT: "پیش‌نویس",
  PUBLISHED: "منتشرشده",
  ARCHIVED: "بایگانی",
};
