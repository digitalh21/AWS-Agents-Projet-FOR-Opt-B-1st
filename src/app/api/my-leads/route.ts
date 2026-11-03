import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { crmLeads } from "@/db/schema";
import { ensureTables } from "@/db/bootstrap";
import { handleError, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { maskPhone, type LeadRow } from "@/lib/lead-sheet";

export const dynamic = "force-dynamic";

/**
 * GET /api/my-leads?q=&niche=&status=
 *
 *  - AGENT: ONLY leads where leads.assigned_agent_id = the signed-in user's id.
 *           Sensitive fields (mobile_no, gmap_link, lead_close_amount) are
 *           masked server-side — they are only sent via the reveal endpoint.
 *  - ADMIN / HR / MANAGER: all leads, unmasked (the UI still offers the toggle).
 */
export async function GET(request: Request) {
  try {
    await ensureTables();
    const user = await requireUser();
    const isAgent = user.role === "AGENT";
    const url = new URL(request.url);
    const q = (url.searchParams.get("q") ?? "").trim();
    const niche = (url.searchParams.get("niche") ?? "").trim();
    const status = (url.searchParams.get("status") ?? "").trim();
    const scope = url.searchParams.get("scope") === "unassigned" && !isAgent ? "unassigned" : "all";

    const conds = [
      isAgent ? eq(crmLeads.assignedAgentId, user.id) : undefined,
      scope === "unassigned" ? sql`${crmLeads.assignedAgentId} is null` : undefined,
      niche ? eq(crmLeads.nicheOrCategory, niche) : undefined,
      status ? eq(crmLeads.leadStatus, status) : undefined,
      q
        ? or(
            ilike(crmLeads.title, `%${q}%`),
            ilike(crmLeads.leadCode, `%${q}%`),
            ilike(crmLeads.cityKeyword, `%${q}%`),
          )
        : undefined,
    ].filter(Boolean);

    const where = conds.length ? and(...conds) : undefined;

    const rows = await db
      .select()
      .from(crmLeads)
      .where(where)
      .orderBy(desc(crmLeads.createdAt), desc(crmLeads.id))
      .limit(500);

    // filter options reflect what THIS viewer is allowed to see
    const base = isAgent ? eq(crmLeads.assignedAgentId, user.id) : undefined;
    const [nicheRows, statusRows] = await Promise.all([
      db
        .selectDistinct({ v: crmLeads.nicheOrCategory })
        .from(crmLeads)
        .where(base)
        .orderBy(asc(crmLeads.nicheOrCategory)),
      db
        .selectDistinct({ v: crmLeads.leadStatus })
        .from(crmLeads)
        .where(base)
        .orderBy(asc(crmLeads.leadStatus)),
    ]);

    const data: LeadRow[] = rows.map((r) => ({
      id: r.id,
      lead_code: r.leadCode,
      city_keyword: r.cityKeyword,
      title: r.title,
      rating: r.rating === null ? null : Number(r.rating),
      reviews: r.reviews,
      niche_or_category: r.nicheOrCategory,
      opens_at: r.opensAt,
      website_status: r.websiteStatus,
      website: r.website,
      status_service: r.statusService,
      call_status: r.callStatus,
      lead_status: r.leadStatus,
      assigned_agent_id: r.assignedAgentId,
      created_at: r.createdAt ? r.createdAt.toISOString() : null,
      mobile_no: isAgent ? maskPhone(r.mobileNo) : r.mobileNo,
      gmap_link: isAgent ? null : r.gmapLink,
      lead_close_amount: isAgent ? null : r.leadCloseAmount,
      has_gmap: Boolean(r.gmapLink),
      has_amount: r.leadCloseAmount !== null,
      masked: isAgent,
    }));

    return ok({
      leads: data,
      total: data.length,
      viewer: { id: user.id, role: user.role, isAgent },
      niches: nicheRows.map((n) => n.v).filter(Boolean),
      statuses: statusRows.map((n) => n.v).filter(Boolean),
    });
  } catch (error) {
    return handleError(error);
  }
}
