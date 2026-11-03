"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Eye, EyeOff, Loader2, MapPin, Phone, RefreshCw, Search, Star } from "lucide-react";
import { toast } from "sonner";
import { Badge, EmptyState, Input, NativeSelect } from "@/components/ui/field";
import { SecureLink } from "@/components/shared/secure-link";
import { dateTime, inr } from "@/lib/utils";
import type { LeadRow } from "@/lib/lead-sheet";

type Revealed = { mobile_no: string | null; gmap_link: string | null; lead_close_amount: string | null };

type Payload = {
  leads: LeadRow[];
  total: number;
  viewer: { id: string; role: string; isAgent: boolean };
  niches: string[];
  statuses: string[];
};

const AUTO_HIDE_MS = 60_000;

function statusTone(status: string | null): "success" | "warn" | "danger" | "muted" {
  const s = (status ?? "").toLowerCase();
  if (s.includes("won") || s.includes("closed")) return "success";
  if (s.includes("not interested") || s.includes("rejected")) return "danger";
  if (s.includes("callback") || s.includes("progress")) return "warn";
  return "muted";
}

/**
 * Lead sheet for the strict `leads` table.
 *
 * Agents only receive leads where assigned_agent_id = their user id, with the
 * sensitive fields (mobile_no, gmap_link, lead_close_amount) masked by the
 * SERVER. Each row has a Show / Hide Information toggle: "Show" asks the server
 * for that one lead's sensitive fields (counts as a click against the quota,
 * unless the admin disabled it) and re-hides them automatically after 60s.
 */
export function LeadSheet({ role }: { role: string }) {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [niche, setNiche] = useState("");
  const [status, setStatus] = useState("");
  const [revealed, setRevealed] = useState<Record<number, Revealed>>({});
  const [busy, setBusy] = useState<number | null>(null);
  const timers = useRef<Record<number, number>>({});
  const isAgent = role === "AGENT";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (niche) params.set("niche", niche);
      if (status) params.set("status", status);
      const res = await fetch(`/api/my-leads?${params.toString()}`, { cache: "no-store" });
      const json = (await res.json()) as Payload & { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Could not load leads");
      setData(json);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load leads");
    } finally {
      setLoading(false);
    }
  }, [q, niche, status]);

  useEffect(() => {
    const t = window.setTimeout(() => void load(), q ? 300 : 0);
    return () => window.clearTimeout(t);
  }, [load, q]);

  useEffect(() => {
    const t = timers.current;
    return () => Object.values(t).forEach((id) => window.clearTimeout(id));
  }, []);

  const hide = useCallback((id: number) => {
    window.clearTimeout(timers.current[id]);
    delete timers.current[id];
    setRevealed((r) => {
      const next = { ...r };
      delete next[id];
      return next;
    });
  }, []);

  async function toggle(lead: LeadRow) {
    if (revealed[lead.id]) return hide(lead.id);

    let value: Revealed;
    if (!lead.masked) {
      // management already received the real values — this toggle is visual only
      value = { mobile_no: lead.mobile_no, gmap_link: lead.gmap_link, lead_close_amount: lead.lead_close_amount };
    } else {
      setBusy(lead.id);
      try {
        const res = await fetch(`/api/my-leads/${lead.id}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "reveal" }),
        });
        const json = (await res.json()) as Revealed & { error?: string; locked?: boolean };
        if (!res.ok) {
          toast.error(json.locked ? "Daily click quota reached — contact your manager." : (json.error ?? "Could not reveal"));
          return;
        }
        value = { mobile_no: json.mobile_no, gmap_link: json.gmap_link, lead_close_amount: json.lead_close_amount };
      } catch {
        toast.error("Network error");
        return;
      } finally {
        setBusy(null);
      }
    }
    setRevealed((r) => ({ ...r, [lead.id]: value }));
    timers.current[lead.id] = window.setTimeout(() => hide(lead.id), AUTO_HIDE_MS);
  }

  const leads = useMemo(() => data?.leads ?? [], [data]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-lg font-extrabold tracking-tight sm:text-xl">
            {isAgent ? "My Assigned Leads" : "Lead Sheet"}
          </h1>
          <p className="text-xs text-muted-foreground">
            {isAgent
              ? "Only leads assigned to you are shown. Contact details stay hidden until you tap Show."
              : "All leads. Sensitive columns are hidden by default — use the row toggle to reveal them."}
          </p>
        </div>
        <Badge variant="muted">{data ? `${data.total} lead${data.total === 1 ? "" : "s"}` : "…"}</Badge>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-[12rem] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search business, code or city…"
            className="pl-8"
          />
        </div>
        <NativeSelect value={niche} onChange={(e) => setNiche(e.target.value)} className="w-auto">
          <option value="">All niches</option>
          {data?.niches.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect value={status} onChange={(e) => setStatus(e.target.value)} className="w-auto">
          <option value="">All statuses</option>
          {data?.statuses.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </NativeSelect>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex h-10 items-center gap-1.5 rounded-lg border bg-white px-3 text-xs font-semibold hover:bg-slate-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {loading && !data ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading leads…
        </div>
      ) : leads.length === 0 ? (
        <EmptyState
          icon="📋"
          title={isAgent ? "No leads assigned to you yet" : "No leads found"}
          hint={isAgent ? "Your manager will assign leads to you." : "Adjust the filters or add leads."}
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-white">
          <table className="w-full min-w-[1100px] text-left text-xs">
            <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Lead</th>
                <th className="px-3 py-2">Niche · City</th>
                <th className="px-3 py-2">Rating</th>
                <th className="px-3 py-2">Opens</th>
                <th className="px-3 py-2">Website</th>
                <th className="px-3 py-2">Service</th>
                <th className="px-3 py-2">Call</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Mobile</th>
                <th className="px-3 py-2">Map</th>
                <th className="px-3 py-2">Close amount</th>
                <th className="px-3 py-2 text-right">Info</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {leads.map((l) => {
                const r = revealed[l.id];
                const shown = Boolean(r);
                return (
                  <tr key={l.id} className="align-top hover:bg-slate-50/60">
                    <td className="px-3 py-2">
                      <p className="font-bold text-slate-900">{l.title}</p>
                      <p className="font-mono text-[10px] text-muted-foreground">{l.lead_code}</p>
                    </td>
                    <td className="px-3 py-2">
                      <p className="font-medium">{l.niche_or_category ?? "—"}</p>
                      <p className="text-[10px] text-muted-foreground">{l.city_keyword ?? "—"}</p>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      <span className="inline-flex items-center gap-1 font-semibold">
                        <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                        {l.rating ?? 0}
                      </span>
                      <span className="ml-1 text-[10px] text-muted-foreground">({l.reviews ?? 0})</span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">{l.opens_at ?? "—"}</td>
                    <td className="px-3 py-2">
                      <p>{l.website_status ?? "—"}</p>
                      {l.website ? (
                        <SecureLink href={l.website} className="block max-w-[11rem] truncate text-[10px] text-blue-600 underline">
                          {l.website.replace(/^https?:\/\//, "")}
                        </SecureLink>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">{l.status_service ?? "—"}</td>
                    <td className="px-3 py-2">{l.call_status ?? "—"}</td>
                    <td className="px-3 py-2">
                      <Badge variant={statusTone(l.lead_status)}>{l.lead_status ?? "—"}</Badge>
                    </td>

                    {/* ---- sensitive columns: masked until the row toggle is on ---- */}
                    <td className="whitespace-nowrap px-3 py-2 font-mono">
                      {shown ? (
                        <span className="inline-flex items-center gap-1.5" data-allow-select="true">
                          <Phone className="h-3 w-3 text-emerald-600" />
                          {r?.mobile_no ?? "—"}
                        </span>
                      ) : (
                        <span className="text-slate-400">{l.mobile_no ? (l.masked ? l.mobile_no : "•••••• ••••") : "—"}</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {shown ? (
                        r?.gmap_link ? (
                          <SecureLink href={r.gmap_link} className="inline-flex items-center gap-1 text-blue-600 underline">
                            <MapPin className="h-3 w-3" /> Open map
                          </SecureLink>
                        ) : (
                          "—"
                        )
                      ) : (
                        <span className="text-slate-400">{l.has_gmap ? "••••••••" : "—"}</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 font-semibold">
                      {shown ? (
                        r?.lead_close_amount ? inr(r.lead_close_amount) : "—"
                      ) : (
                        <span className="text-slate-400">{l.has_amount ? "₹ ••••••" : "—"}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => void toggle(l)}
                        disabled={busy === l.id}
                        aria-pressed={shown}
                        className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-bold transition disabled:opacity-60 ${
                          shown
                            ? "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
                            : "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
                        }`}
                      >
                        {busy === l.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : shown ? (
                          <EyeOff className="h-3 w-3" />
                        ) : (
                          <Eye className="h-3 w-3" />
                        )}
                        {shown ? "Hide Information" : "Show Information"}
                      </button>
                      {!isAgent && l.created_at ? (
                        <p className="mt-1 text-[9px] text-muted-foreground">{dateTime(l.created_at)}</p>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
