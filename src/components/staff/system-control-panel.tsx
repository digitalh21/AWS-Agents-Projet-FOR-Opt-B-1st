"use client";

import { useCallback, useState } from "react";
import {
  Activity,
  Database,
  EyeOff,
  KeyRound,
  Link2Off,
  Loader2,
  MegaphoneOff,
  MousePointerClick,
  RefreshCw,
  Save,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge, Input, Label, NativeSelect, SectionCard, Textarea } from "@/components/ui/field";
import { useFeatureFlags } from "@/components/shared/feature-flags";
import type { Diagnostics } from "@/lib/diagnostics";
import { cn } from "@/lib/utils";

type Settings = Record<string, string>;

const TOGGLES: Array<{
  key: string;
  title: string;
  description: string;
  icon: typeof Activity;
}> = [
  {
    key: "click_quota_enabled",
    title: "Click Quota restriction",
    description:
      "ON: agents are limited by their daily click quota. OFF: agents get unlimited clicks / lead views, no daily limit.",
    icon: MousePointerClick,
  },
  {
    key: "secure_link_enabled",
    title: "Secure Links (hide URL on hover)",
    description:
      "ON: links navigate with router.push() and show no URL in the browser status bar. OFF: normal links.",
    icon: Link2Off,
  },
  {
    key: "security_guard_enabled",
    title: "Banking Security Guard",
    description:
      "ON: right-click, F12 / Ctrl+Shift+I/J/U are blocked and text selection is disabled. OFF: browser behaves normally.",
    icon: ShieldCheck,
  },
  {
    key: "live_activity_enabled",
    title: "Live activity & quota tracker",
    description:
      "ON: agents see a live click counter, active session timer and quota status in the header. OFF: hidden.",
    icon: Activity,
  },
];

function Switch({
  checked,
  disabled,
  busy,
  onChange,
  label,
}: {
  checked: boolean;
  disabled?: boolean;
  busy?: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled || busy}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "border-emerald-600 bg-emerald-600" : "border-slate-300 bg-slate-200",
      )}
    >
      <span
        className={cn(
          "inline-flex h-5 w-5 items-center justify-center rounded-full bg-white shadow transition-transform",
          checked ? "translate-x-[22px]" : "translate-x-0.5",
        )}
      >
        {busy ? <Loader2 className="h-3 w-3 animate-spin text-slate-500" /> : null}
      </span>
    </button>
  );
}

export function SystemControlPanel({
  initialSettings,
  initialDiagnostics,
  canEdit,
  isAdmin,
}: {
  initialSettings: Settings;
  initialDiagnostics: Diagnostics | null;
  canEdit: boolean;
  isAdmin: boolean;
}) {
  const { refresh } = useFeatureFlags();
  const [settings, setSettings] = useState<Settings>(initialSettings);
  const [diag, setDiag] = useState<Diagnostics | null>(initialDiagnostics);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [savingPopup, setSavingPopup] = useState(false);
  const [loadingDiag, setLoadingDiag] = useState(false);

  const [popup, setPopup] = useState({
    type: settings["popup_type"] ?? "maintenance",
    title: settings["popup_title"] ?? "",
    message: settings["popup_message"] ?? "",
  });

  const patch = useCallback(
    async (updates: Record<string, string>) => {
      const res = await fetch("/api/settings/system", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ updates }),
      });
      const json = (await res.json()) as { settings?: Settings; error?: string };
      if (!res.ok || !json.settings) throw new Error(json.error ?? "Could not save setting");
      setSettings(json.settings);
      await refresh();
    },
    [refresh],
  );

  async function toggle(key: string, next: boolean) {
    setBusyKey(key);
    try {
      await patch({ [key]: String(next) });
      toast.success(`${next ? "Enabled" : "Disabled"} successfully`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusyKey(null);
    }
  }

  async function savePopup(enable?: boolean) {
    setSavingPopup(true);
    try {
      const updates: Record<string, string> = {
        popup_type: popup.type,
        popup_title: popup.title.trim(),
        popup_message: popup.message.trim(),
      };
      if (enable !== undefined) updates["popup_enabled"] = String(enable);
      await patch(updates);
      toast.success(enable === true ? "Popup is now live for site users" : enable === false ? "Popup disabled" : "Popup saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSavingPopup(false);
    }
  }

  async function reloadDiag() {
    setLoadingDiag(true);
    try {
      const res = await fetch("/api/settings/system", { cache: "no-store" });
      const json = (await res.json()) as { diagnostics?: Diagnostics | null };
      if (json.diagnostics) setDiag(json.diagnostics);
    } finally {
      setLoadingDiag(false);
    }
  }

  const popupLive = settings["popup_enabled"] === "true";

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-extrabold tracking-tight sm:text-xl">Admin Control Panel</h1>
        <p className="text-xs text-muted-foreground">
          System-wide switches. Changes apply to every signed-in user within ~20 seconds.
          {!canEdit ? " You have read-only access." : ""}
        </p>
      </div>

      <SectionCard title="Feature switches" icon={<ShieldCheck className="h-3.5 w-3.5" />}>
        <div className="divide-y">
          {TOGGLES.map((t) => {
            const on = settings[t.key] === "true";
            return (
              <div key={t.key} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                  <t.icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-bold">
                    {t.title}
                    <Badge variant={on ? "success" : "muted"}>{on ? "Enabled" : "Disabled"}</Badge>
                  </p>
                  <p className="text-[11px] leading-snug text-muted-foreground">{t.description}</p>
                </div>
                <Switch
                  checked={on}
                  disabled={!canEdit}
                  busy={busyKey === t.key}
                  label={t.title}
                  onChange={(next) => void toggle(t.key, next)}
                />
              </div>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard
        title="Site popup · maintenance / holiday / greeting"
        icon={<MegaphoneOff className="h-3.5 w-3.5" />}
        action={<Badge variant={popupLive ? "danger" : "muted"}>{popupLive ? "LIVE — blocking users" : "Off"}</Badge>}
      >
        <p className="mb-3 text-[11px] text-muted-foreground">
          When live, every agent sees a popup after login that cannot be closed until you disable it. ADMIN, HR and
          MANAGER roles are never blocked.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <Label>Type</Label>
            <NativeSelect
              value={popup.type}
              disabled={!canEdit}
              onChange={(e) => setPopup({ ...popup, type: e.target.value })}
            >
              <option value="maintenance">🛠 Maintenance</option>
              <option value="holiday">🎉 Holiday notice</option>
              <option value="greeting">👋 Greeting</option>
            </NativeSelect>
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label>Title</Label>
            <Input
              value={popup.title}
              maxLength={120}
              disabled={!canEdit}
              onChange={(e) => setPopup({ ...popup, title: e.target.value })}
              placeholder="Scheduled maintenance"
            />
          </div>
          <div className="space-y-1 sm:col-span-3">
            <Label>Message</Label>
            <Textarea
              rows={3}
              value={popup.message}
              maxLength={1000}
              disabled={!canEdit}
              onChange={(e) => setPopup({ ...popup, message: e.target.value })}
              placeholder="We'll be back at 6 PM IST."
            />
          </div>
        </div>
        {canEdit ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={savingPopup} onClick={() => void savePopup()}>
              {savingPopup ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save
              text
            </Button>
            {popupLive ? (
              <Button size="sm" variant="destructive" disabled={savingPopup} onClick={() => void savePopup(false)}>
                <EyeOff className="h-3.5 w-3.5" /> Disable popup
              </Button>
            ) : (
              <Button size="sm" disabled={savingPopup} onClick={() => void savePopup(true)}>
                Save &amp; show to site users
              </Button>
            )}
          </div>
        ) : null}
      </SectionCard>

      {isAdmin && diag ? (
        <>
          <SectionCard
            title="Active database connection"
            icon={<Database className="h-3.5 w-3.5" />}
            action={
              <Button size="xs" variant="outline" onClick={() => void reloadDiag()} disabled={loadingDiag}>
                <RefreshCw className={cn("h-3 w-3", loadingDiag && "animate-spin")} /> Re-test
              </Button>
            }
          >
            <dl className="grid gap-x-6 gap-y-2 text-xs sm:grid-cols-2">
              {[
                ["Status", null],
                ["Driver", diag.database.driver],
                ["Host", diag.database.host],
                ["Database", diag.database.database],
                ["User", diag.database.user ?? "—"],
                ["Latency", diag.database.latencyMs !== null ? `${diag.database.latencyMs} ms` : "—"],
                ["Server", diag.database.version ?? "—"],
                ["Server time", diag.database.serverTime ?? "—"],
              ].map(([k, v]) => (
                <div key={k as string} className="flex items-center justify-between gap-3 border-b py-1.5">
                  <dt className="font-semibold text-muted-foreground">{k}</dt>
                  <dd className="min-w-0 truncate text-right font-mono">
                    {k === "Status" ? (
                      <Badge variant={diag.database.status === "up" ? "success" : "danger"}>
                        {diag.database.status === "up" ? "Connected" : "Down"}
                      </Badge>
                    ) : (
                      v
                    )}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mt-2 break-all rounded-lg bg-slate-50 px-2.5 py-2 font-mono text-[11px] text-slate-600">
              {diag.database.connection}
            </p>
            {diag.database.error ? <p className="mt-2 text-xs text-rose-600">{diag.database.error}</p> : null}
          </SectionCard>

          <SectionCard title={`Loaded environment variables (${diag.env.length})`} icon={<KeyRound className="h-3.5 w-3.5" />}>
            <p className="mb-2 text-[11px] text-muted-foreground">
              Secrets are masked on the server — full values are never sent to the browser.
            </p>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Variable</th>
                    <th className="px-3 py-2">Value</th>
                    <th className="px-3 py-2 text-right">State</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {diag.env.map((e) => (
                    <tr key={e.key}>
                      <td className="whitespace-nowrap px-3 py-1.5 font-mono font-semibold">{e.key}</td>
                      <td className="max-w-[18rem] truncate px-3 py-1.5 font-mono text-slate-600">
                        {e.set ? e.value : "—"}
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        {e.set ? (
                          <Badge variant="success">{e.secret ? "set · masked" : "set"}</Badge>
                        ) : (
                          <Badge variant="danger">missing</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </>
      ) : null}
    </div>
  );
}
