"use client";

import { useEffect, useState } from "react";
import { Gauge, MousePointerClick, ShieldAlert, Timer } from "lucide-react";
import { useFeatureFlags } from "@/components/shared/feature-flags";
import { useInteraction } from "@/components/shared/security-guard";
import { cn, hms } from "@/lib/utils";

/**
 * Compact live tracker for the agent header:
 *   • real-time click counter
 *   • active session timer
 *   • dynamic quota status (Unlimited / N left / Locked)
 *
 * Hidden entirely when the admin disables "Live activity tracker".
 */
export function HeaderActivity() {
  const { flags } = useFeatureFlags();
  const { state } = useInteraction();
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (!flags.liveActivity) return;
    const t = window.setInterval(() => {
      if (document.visibilityState === "visible") setSeconds((s) => s + 1);
    }, 1000);
    return () => window.clearInterval(t);
  }, [flags.liveActivity]);

  if (!flags.liveActivity) return null;

  const clicks = Math.max(state.clicks, state.sessionClicks);
  const limited = flags.clickQuota && state.limit !== null;
  const pct = limited && state.limit ? Math.min(100, Math.round((state.used / state.limit) * 100)) : 0;

  let quotaLabel = "Quota off · Unlimited";
  let tone = "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (flags.clickQuota && state.limit === null) quotaLabel = "Unlimited";
  if (limited) {
    if (state.locked) {
      quotaLabel = "Locked";
      tone = "border-rose-200 bg-rose-50 text-rose-700";
    } else {
      quotaLabel = `${state.remaining ?? 0} / ${state.limit} left`;
      tone = pct >= 80 ? "border-amber-200 bg-amber-50 text-amber-700" : "border-blue-200 bg-blue-50 text-blue-700";
    }
  }

  return (
    <div className="hidden shrink-0 items-center gap-1.5 md:flex" aria-label="Live activity">
      <span
        className="flex items-center gap-1 rounded-full border bg-white px-2.5 py-1 text-[10px] font-semibold text-slate-600"
        title="Clicks / actions today"
      >
        <MousePointerClick className="h-3 w-3 text-blue-600" />
        <span className="font-mono tabular-nums text-slate-800">{clicks}</span>
      </span>
      <span
        className="flex items-center gap-1 rounded-full border bg-white px-2.5 py-1 text-[10px] font-semibold text-slate-600"
        title="Active session time"
      >
        <Timer className="h-3 w-3 text-violet-600" />
        <span className="font-mono tabular-nums text-slate-800">{hms(seconds)}</span>
      </span>
      <span
        className={cn("flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-bold", tone)}
        title="Daily click quota status"
      >
        {state.locked && limited ? <ShieldAlert className="h-3 w-3" /> : <Gauge className="h-3 w-3" />}
        {quotaLabel}
      </span>
    </div>
  );
}
