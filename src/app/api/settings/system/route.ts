import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { audit, fail, handleError, ok } from "@/lib/api";
import { requireStaff } from "@/lib/auth";
import { SETTING_KEYS, getSettings, setSetting } from "@/lib/settings";
import { getDiagnostics } from "@/lib/diagnostics";
import { ensureTables } from "@/db/bootstrap";

export const dynamic = "force-dynamic";

const bool = (v: string) => v === "true" || v === "false";

const ALLOWED: Record<string, (v: string) => boolean> = {
  [SETTING_KEYS.showHistoryToAgent]: bool,
  [SETTING_KEYS.clickQuotaEnabled]: bool,
  [SETTING_KEYS.secureLinkEnabled]: bool,
  [SETTING_KEYS.securityGuardEnabled]: bool,
  [SETTING_KEYS.liveActivityEnabled]: bool,
  [SETTING_KEYS.popupEnabled]: bool,
  [SETTING_KEYS.popupType]: (v) => ["maintenance", "holiday", "greeting"].includes(v),
  [SETTING_KEYS.popupTitle]: (v) => v.trim().length >= 1 && v.length <= 120,
  [SETTING_KEYS.popupMessage]: (v) => v.trim().length >= 1 && v.length <= 1000,
};

export async function GET() {
  try {
    await ensureTables();
    const staff = await requireStaff();
    const values = await getSettings();

    const history = await db
      .select({
        id: users.id,
        name: users.name,
        role: users.role,
        updatedAt: sql<string>`to_char(${users.lastSeenAt}, 'YYYY-MM-DD')`,
      })
      .from(users)
      .where(eq(users.role, "AGENT"))
      .orderBy(desc(users.lastSeenAt))
      .limit(1);

    return ok({
      settings: values,
      viewer: { id: staff.id, role: staff.role, canEdit: staff.role === "ADMIN" || staff.role === "HR" },
      // DB connection + environment are ADMIN-only (values are masked server-side).
      diagnostics: staff.role === "ADMIN" ? await getDiagnostics() : null,
      meta: {
        [SETTING_KEYS.showHistoryToAgent]: {
          label: "Show History to Agent",
          description:
            "When off, agents see the masked banner 'Audit history · previous agents (anonymous)' and must request access.",
          lastTouchedLead: history[0]?.updatedAt ?? null,
        },
      },
    });
  } catch (error) {
    return handleError(error);
  }
}

/**
 * PATCH { key, value }            — change one setting
 * PATCH { updates: { key: value } } — change several atomically-validated settings
 */
export async function PATCH(request: Request) {
  try {
    await ensureTables();
    const staff = await requireStaff();
    if (staff.role !== "ADMIN" && staff.role !== "HR") {
      return fail("Only ADMIN or HR can change system settings", 403);
    }
    const body = (await request.json()) as {
      key?: string;
      value?: string;
      updates?: Record<string, unknown>;
    };

    const entries: Array<[string, string]> = body.updates
      ? Object.entries(body.updates).map(([k, v]) => [k, String(v ?? "")] as [string, string])
      : [[String(body.key ?? ""), String(body.value ?? "")]];

    if (entries.length === 0) return fail("Nothing to update", 422);
    for (const [key, value] of entries) {
      if (!ALLOWED[key]) return fail(`Unknown or unsupported setting: ${key}`, 422);
      if (!ALLOWED[key](value)) return fail(`Invalid value for ${key}`, 422);
    }

    for (const [key, value] of entries) {
      await setSetting(key, value, staff.id);
      await audit({
        actorId: staff.id,
        actorRole: staff.role,
        action: "SETTING_UPDATED",
        detail: `${key} = ${key.startsWith("popup_") && key !== SETTING_KEYS.popupEnabled ? "(updated)" : value}`,
      });
    }

    return ok({ updated: entries.map(([k]) => k), settings: await getSettings() });
  } catch (error) {
    return handleError(error);
  }
}
