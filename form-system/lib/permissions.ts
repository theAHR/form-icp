export const permissions = [
  "dashboard.read",
  "forms.read",
  "forms.write",
  "submissions.read",
  "submissions.write",
  "submissions.sensitive",
  "people.read",
  "requests.read",
  "requests.write",
  "requests.approve",
  "members.read",
  "members.write",
  "users.manage",
  "reports.export",
  "audit.read",
  "settings.manage",
] as const;
export type Permission = (typeof permissions)[number];

/** فقط دو نقش فعال: مدیر سیستم و ثبت‌کننده */
export const rolePermissions: Record<string, readonly string[]> = {
  SUPER_ADMIN: permissions,
  REGISTRAR: [
    "dashboard.read",
    "forms.read",
    "submissions.read",
    "submissions.write",
    "people.read",
    "members.read",
    "members.write",
  ],
};

export const roleLabels: Record<string, string> = {
  SUPER_ADMIN: "مدیر سیستم",
  REGISTRAR: "ثبت‌کننده",
};

export function hasPermission(list: readonly string[], permission: string) {
  return list.includes(permission);
}
