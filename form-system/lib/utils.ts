import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
export function toPersianDigits(value: string | number | null | undefined) {
  if (value == null || value === "") return "";
  return String(value).replace(/\d/g, (d) => FA_DIGITS[Number(d)]!);
}
export const date = (v: string | Date) => {
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const [y, m, d] = v.split("-").map(Number);
    return toPersianDigits(
      new Date(y, m - 1, d).toLocaleDateString("fa-IR-u-ca-persian"),
    );
  }
  return toPersianDigits(
    new Date(v).toLocaleDateString("fa-IR-u-ca-persian"),
  );
};
export const dateTime = (v: string | Date) =>
  toPersianDigits(new Date(v).toLocaleString("fa-IR-u-ca-persian"));
