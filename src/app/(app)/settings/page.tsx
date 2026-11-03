import { FieldPermissionsPanel } from "@/components/staff/field-permissions-panel";
import { SystemControlPanel } from "@/components/staff/system-control-panel";
import { requireStaffPage } from "@/lib/auth";
import { getDiagnostics } from "@/lib/diagnostics";
import { getFieldPolicy } from "@/lib/field-visibility";
import { ensureSeed } from "@/lib/seed";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const staff = await requireStaffPage();
  await ensureSeed().catch(() => undefined);
  const canEdit = staff.role === "ADMIN" || staff.role === "HR";
  const isAdmin = staff.role === "ADMIN";
  // Server-render everything so it paints immediately (no client round trip).
  const [policy, settings, diagnostics] = await Promise.all([
    getFieldPolicy(),
    getSettings(),
    isAdmin ? getDiagnostics() : Promise.resolve(null),
  ]);
  return (
    <div className="space-y-8">
      <SystemControlPanel
        initialSettings={settings}
        initialDiagnostics={diagnostics}
        canEdit={canEdit}
        isAdmin={isAdmin}
      />
      <FieldPermissionsPanel initialPolicy={policy} viewerRole={staff.role} canEdit={canEdit} />
    </div>
  );
}
