import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { crmLeads } from "@/db/schema";
import { fail, handleError, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { consumeQuota } from "@/lib/activity-tracking";

export const dynamic = "force-dynamic";

/**
 * POST /api/my-leads/[id]  { action: "reveal" }
 *
 * Returns the sensitive fields (mobile_no, gmap_link, lead_close_amount) of ONE
 * lead. An agent can only reveal leads assigned to them. Each reveal counts as a
 * lead view against the Click Quota — unless the admin has disabled the quota,
 * in which case the agent has unlimited reveals.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id: rawId } = await ctx.params;
    const id = Number(rawId);
    if (!Number.isInteger(id) || id <= 0) return fail("Invalid lead id", 422);

    const body = (await request.json().catch(() => ({}))) as { action?: string };
    if (body.action !== "reveal") return fail("Unsupported action", 422);

    const isAgent = user.role === "AGENT";
    const [lead] = await db
      .select()
      .from(crmLeads)
      .where(isAgent ? and(eq(crmLeads.id, id), eq(crmLeads.assignedAgentId, user.id)) : eq(crmLeads.id, id))
      .limit(1);
    if (!lead) return fail("Lead not found", 404);

    let quota = null;
    if (isAgent) {
      const res = await consumeQuota(user.id, [{ type: "LEAD_OPEN", target: `lead:${id}`, path: "/lead-sheet" }]);
      quota = res.quota;
      if (res.quota.locked && res.allowed <= 0) {
        return ok({ locked: true, quota, error: "Daily click quota reached" }, 429);
      }
    }

    return ok({
      id: lead.id,
      mobile_no: lead.mobileNo,
      gmap_link: lead.gmapLink,
      lead_close_amount: lead.leadCloseAmount,
      quota,
    });
  } catch (error) {
    return handleError(error);
  }
}
