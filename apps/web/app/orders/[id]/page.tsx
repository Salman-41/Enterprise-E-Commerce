import { OrderDetail } from "@/components/order";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  return (
    <OrderDetail id={(await params).id} token={(await searchParams).token} />
  );
}
