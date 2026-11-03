"use client";

import { useEffect, useState, type ReactNode } from "react";
import { CalendarHeart, LogOut, Sparkles, Wrench } from "lucide-react";
import { useFeatureFlags } from "@/components/shared/feature-flags";

const MANAGEMENT = new Set(["ADMIN", "HR", "MANAGER"]);

const KIND = {
  maintenance: { Icon: Wrench, label: "Maintenance", tone: "from-amber-500 to-orange-500" },
  holiday: { Icon: CalendarHeart, label: "Holiday notice", tone: "from-emerald-500 to-teal-500" },
  greeting: { Icon: Sparkles, label: "Greetings", tone: "from-blue-600 to-violet-600" },
} as const;

/**
 * Non-skippable site popup (maintenance / holiday / greeting).
 *
 * Shown to every signed-in user until an admin switches it off. There is no
 * close button, no backdrop dismissal and no Escape handling; the app behind
 * it is made `inert` so it cannot be reached by keyboard either. Management
 * roles (ADMIN / HR / MANAGER) and staff previewing an agent are bypassed.
 *
 * The flag is re-polled by <FeatureFlagsProvider>, so the popup disappears on
 * its own as soon as the admin disables it.
 */
export function MaintenanceGate({
  role,
  bypass = false,
  children,
}: {
  role: string;
  bypass?: boolean;
  children: ReactNode;
}) {
  const { flags } = useFeatureFlags();
  const { popup } = flags;
  const blocked = popup.enabled && !bypass && !MANAGEMENT.has(role);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (!blocked) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const swallow = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("keydown", swallow, true);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", swallow, true);
    };
  }, [blocked]);

  async function signOut() {
    setLeaving(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      window.location.href = "/login";
    }
  }

  const meta = KIND[popup.type] ?? KIND.maintenance;

  return (
    <>
      <div className="contents" inert={blocked ? true : undefined} aria-hidden={blocked ? true : undefined}>
        {children}
      </div>
      {blocked ? (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="site-popup-title"
          aria-describedby="site-popup-body"
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-md"
        >
          <div className="w-full max-w-md overflow-hidden rounded-2xl border bg-white shadow-2xl">
            <div className={`bg-gradient-to-r ${meta.tone} px-5 py-4 text-white`}>
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/20">
                  <meta.Icon className="h-6 w-6" />
                </span>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-white/80">{meta.label}</p>
                  <h2 id="site-popup-title" className="text-lg font-extrabold leading-tight">
                    {popup.title || meta.label}
                  </h2>
                </div>
              </div>
            </div>
            <div className="space-y-4 px-5 py-5">
              <p id="site-popup-body" className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                {popup.message}
              </p>
              <p className="rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
                This notice stays on screen until an administrator turns it off. It will close automatically.
              </p>
              <button
                type="button"
                onClick={() => void signOut()}
                disabled={leaving}
                className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                <LogOut className="h-3.5 w-3.5" /> {leaving ? "Signing out…" : "Sign out"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
