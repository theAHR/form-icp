import { Admin } from "@/components/admin";

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <Admin key={"submit-" + slug} section="submit" slug={slug} />;
}
