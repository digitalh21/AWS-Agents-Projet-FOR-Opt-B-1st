import { sql } from "drizzle-orm";
import { db } from "@/db";
import { ensureTables } from "@/db/bootstrap";

export const SETTING_KEYS = {
  showHistoryToAgent: "show_history_to_agent",
  /** Click Quota restriction system master switch (off = unlimited clicks). */
  clickQuotaEnabled: "click_quota_enabled",
  /** <SecureLink> router-based navigation (no URL preview on hover). */
  secureLinkEnabled: "secure_link_enabled",
  /** PhonePe-style banking security guard (right-click / devtools / selection). */
  securityGuardEnabled: "security_guard_enabled",
  /** Live click counter + session timer + quota indicator in the header. */
  liveActivityEnabled: "live_activity_enabled",
  /** Non-skippable maintenance / holiday / greeting popup. */
  popupEnabled: "popup_enabled",
  popupType: "popup_type",
  popupTitle: "popup_title",
  popupMessage: "popup_message",
} as const;

type Defaults = Record<string, string>;

const DEFAULTS: Defaults = {
  [SETTING_KEYS.showHistoryToAgent]: "true",
  [SETTING_KEYS.clickQuotaEnabled]: "true",
  [SETTING_KEYS.secureLinkEnabled]: "true",
  [SETTING_KEYS.securityGuardEnabled]: "true",
  [SETTING_KEYS.liveActivityEnabled]: "true",
  [SETTING_KEYS.popupEnabled]: "false",
  [SETTING_KEYS.popupType]: "maintenance",
  [SETTING_KEYS.popupTitle]: "Scheduled maintenance",
  [SETTING_KEYS.popupMessage]: "We are performing scheduled maintenance. Please check back shortly.",
};

let cache: { values: Defaults; at: number } | null = null;
const TTL_MS = 5_000;

export function invalidateSettings() {
  cache = null;
}

export async function getSettings(): Promise<Defaults> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.values;
  const values: Defaults = { ...DEFAULTS };
  try {
    const rows = await db.execute<{ key: string; value: string }>(
      sql`select key, value from system_settings`,
    );
    for (const row of rows.rows) values[row.key] = row.value;
  } catch {
    // table not provisioned yet
  }
  cache = { values, at: Date.now() };
  return values;
}

export async function getSetting(key: string): Promise<string> {
  const all = await getSettings();
  return all[key] ?? DEFAULTS[key] ?? "";
}

export async function getBoolSetting(key: string): Promise<boolean> {
  return (await getSetting(key)) === "true";
}

/** Agents may see past-agent audit history only when this is enabled. */
export async function agentHistoryVisible(): Promise<boolean> {
  return getBoolSetting(SETTING_KEYS.showHistoryToAgent);
}

/** Admin switch: when false, the Click Quota is not enforced (unlimited). */
export async function clickQuotaEnabled(): Promise<boolean> {
  return getBoolSetting(SETTING_KEYS.clickQuotaEnabled);
}

export type PopupType = "maintenance" | "holiday" | "greeting";

export type PublicFlags = {
  clickQuota: boolean;
  secureLinks: boolean;
  securityGuard: boolean;
  liveActivity: boolean;
  popup: { enabled: boolean; type: PopupType; title: string; message: string };
};

/** Non-sensitive flags every signed-in browser needs (client feature toggles). */
export async function getPublicFlags(): Promise<PublicFlags> {
  const s = await getSettings();
  const on = (k: string) => s[k] === "true";
  const type = (["maintenance", "holiday", "greeting"].includes(s[SETTING_KEYS.popupType] ?? "")
    ? s[SETTING_KEYS.popupType]
    : "maintenance") as PopupType;
  return {
    clickQuota: on(SETTING_KEYS.clickQuotaEnabled),
    secureLinks: on(SETTING_KEYS.secureLinkEnabled),
    securityGuard: on(SETTING_KEYS.securityGuardEnabled),
    liveActivity: on(SETTING_KEYS.liveActivityEnabled),
    popup: {
      enabled: on(SETTING_KEYS.popupEnabled),
      type,
      title: s[SETTING_KEYS.popupTitle] ?? "",
      message: s[SETTING_KEYS.popupMessage] ?? "",
    },
  };
}

export async function setSetting(key: string, value: string, updatedBy: string) {
  await ensureTables();
  await db.execute(sql`
    insert into system_settings (key, value, updated_by, updated_at)
    values (${key}, ${value}, ${updatedBy}, now())
    on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now()
  `);
  invalidateSettings();
}
