import { AppError } from "./errors";
export const transitions: Record<string, string[]> = {
  NEW: ["UNDER_REVIEW", "CANCELLED"],
  UNDER_REVIEW: ["NEEDS_CORRECTION", "APPROVED", "REJECTED", "CANCELLED"],
  NEEDS_CORRECTION: ["UNDER_REVIEW", "CANCELLED"],
  APPROVED: [],
  REJECTED: [],
  CANCELLED: [],
};
export function assertTransition(from: string, to: string, reason?: string) {
  if (!transitions[from]?.includes(to))
    throw new AppError(409, "تغییر وضعیت مجاز نیست.");
  if (["REJECTED", "NEEDS_CORRECTION"].includes(to) && !reason?.trim())
    throw new AppError(400, "دلیل را وارد کنید.");
}
