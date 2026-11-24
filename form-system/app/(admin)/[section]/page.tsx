import { Admin } from "@/components/admin";
import { notFound, redirect } from "next/navigation";
export default async function Page({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  if (section === "requests") redirect("/members");
  if (
    ![
      "dashboard",
      "forms",
      "members",
      "users",
      "reports",
      "audit",
      "settings",
    ].includes(section)
  )
    notFound();
  return <Admin key={section} section={section} />;
}
