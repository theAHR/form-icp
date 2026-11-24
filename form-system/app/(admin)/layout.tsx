import { Shell } from "@/components/shell";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { actor } from "@/lib/auth";
export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const h = await headers();
  const user = await actor(new Request("http://internal", { headers: h }));
  if (!user) redirect("/login");
  return <Shell>{children}</Shell>;
}
