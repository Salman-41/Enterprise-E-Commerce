import { redirect } from "next/navigation";
export default async function Category({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  redirect(`/shop?category=${encodeURIComponent((await params).slug)}`);
}
