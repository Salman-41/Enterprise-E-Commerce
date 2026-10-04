import { notFound } from "next/navigation";
import { AdminConsole } from "../../../admin-components/console";
import { sections, type Section } from "../../../admin-components/contracts";
export default async function AdminSection({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  if (!sections.includes(section as Section)) notFound();
  return <AdminConsole section={section as Section} />;
}
