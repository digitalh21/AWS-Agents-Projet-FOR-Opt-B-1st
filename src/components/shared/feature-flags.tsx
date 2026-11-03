"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { PublicFlags } from "@/lib/settings";

/** Safe fallback used outside the provider (e.g. the login page). */
export const DEFAULT_FLAGS: PublicFlags = {
  clickQuota: true,
  secureLinks: false,
  securityGuard: false,
  liveActivity: true,
  popup: { enabled: false, type: "maintenance", title: "", message: "" },
};

type Ctx = { flags: PublicFlags; refresh: () => Promise<void> };

const FlagsContext = createContext<Ctx>({ flags: DEFAULT_FLAGS, refresh: async () => undefined });

export function useFeatureFlags() {
  return useContext(FlagsContext);
}

const POLL_MS = 20_000;

/**
 * Admin-controlled feature switches for the signed-in app.
 *
 * Seeded from the server render, then re-synced every 20s (and on tab focus)
 * so an admin toggling a switch — or the maintenance popup — takes effect for
 * everyone without a manual reload.
 */
export function FeatureFlagsProvider({ initial, children }: { initial: PublicFlags; children: ReactNode }) {
  const [flags, setFlags] = useState<PublicFlags>(initial);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/public", { cache: "no-store" });
      if (!res.ok) return;
      const json = (await res.json()) as { flags?: PublicFlags };
      if (json.flags) setFlags(json.flags);
    } catch {
      /* offline — keep the last known flags */
    }
  }, []);

  useEffect(() => {
    const t = window.setInterval(() => void refresh(), POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  const value = useMemo(() => ({ flags, refresh }), [flags, refresh]);
  return <FlagsContext.Provider value={value}>{children}</FlagsContext.Provider>;
}
