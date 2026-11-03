import { redirect } from "next/navigation";
import { LeadSheet } from "@/components/agent/lead-sheet";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function LeadSheetPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return <LeadSheet role={user.role} />;
}
