import { AuthToken } from "@/components/auth-token";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  return <AuthToken mode="verify" token={(await searchParams).token || ""} />;
}
