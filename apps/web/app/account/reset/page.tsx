import { AuthToken } from "@/components/auth-token";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  return <AuthToken mode="reset" token={(await searchParams).token || ""} />;
}
