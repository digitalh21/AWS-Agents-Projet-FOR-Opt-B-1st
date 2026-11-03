"use client";

import { useState } from "react";
import { Loader2, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export type DeletableNiche = { id: number; name: string; total?: number };

/**
 * Confirmation dialog for deleting a niche.
 * Leads are never deleted — they become "uncategorised" and stay visible under
 * the "All niches" view.
 */
export function DeleteNicheDialog({
  niche,
  onClose,
  onDeleted,
}: {
  niche: DeletableNiche | null;
  onClose: () => void;
  onDeleted: (niche: DeletableNiche) => void;
}) {
  const [busy, setBusy] = useState(false);

  async function confirm() {
    if (!niche) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/niches?id=${niche.id}`, { method: "DELETE" });
      const json = (await res.json()) as { error?: string; leadsKept?: number };
      if (!res.ok) {
        toast.error(json.error ?? "Could not delete niche");
        return;
      }
      toast.success(
        `Niche “${niche.name}” deleted${json.leadsKept ? ` — ${json.leadsKept} lead(s) kept under All niches` : ""}`,
      );
      onDeleted(niche);
      onClose();
    } catch {
      toast.error("Network error — niche not deleted");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={Boolean(niche)} onOpenChange={(v) => !v && !busy && onClose()}>
      <DialogContent hideClose className="sm:w-[min(440px,94vw)]">
        <DialogHeader className="pr-4">
          <DialogTitle className="flex items-center gap-2 text-rose-700">
            <TriangleAlert className="h-5 w-5" /> Delete niche?
          </DialogTitle>
          <DialogDescription>
            “{niche?.name}” will be removed from the sidebar, dropdowns and agent assignments.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 p-4 text-xs text-slate-700">
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-emerald-900">
            <strong>No leads are deleted.</strong>{" "}
            {niche?.total
              ? `${niche.total.toLocaleString("en-IN")} lead(s) will become “Uncategorised” and remain visible under All niches.`
              : "Any leads in this niche become “Uncategorised” and remain visible under All niches."}
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" className="flex-1" disabled={busy} onClick={onClose}>
              Cancel
            </Button>
            <Button variant="destructive" className="flex-1" disabled={busy} onClick={() => void confirm()}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Delete niche
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
