import { asc, eq, sql } from "drizzle-orm";
import { users } from "@/db/schema";
import { db } from "@/db";
import { leadRequests, leads, niches, templates } from "@/db/schema";
import { audit, fail, handleError, ok } from "@/lib/api";
import { requireStaff } from "@/lib/auth";
import { ensureTables } from "@/db/bootstrap";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await ensureTables();
    const viewer = await requireStaff();
    // Grouped aggregates instead of correlated subqueries (they mis-bind under Drizzle).
    const [rows, totals, assignedRows, closedRows, agentRows, visibilityRows] = await Promise.all([
      db
        .select({ id: niches.id, name: niches.name, slug: niches.slug, color: niches.color, description: niches.description })
        .from(niches)
        .orderBy(asc(niches.id)),
      db.select({ nicheId: leads.nicheId, value: sql<number>`count(*)::int` }).from(leads).groupBy(leads.nicheId),
      db
        .select({ nicheId: leads.nicheId, value: sql<number>`count(*)::int` })
        .from(leads)
        .where(sql`${leads.assignedAgentId} is not null`)
        .groupBy(leads.nicheId),
      db
        .select({ nicheId: leads.nicheId, value: sql<number>`count(*)::int` })
        .from(leads)
        .where(eq(leads.status, "CLOSED"))
        .groupBy(leads.nicheId),
      db
        .select({ id: users.id, primaryNicheId: users.primaryNicheId })
        .from(users)
        .where(eq(users.role, "AGENT")),
      db.select({ id: niches.id, visibleToAgents: niches.visibleToAgents }).from(niches),
    ]);

    const map = (list: Array<{ nicheId: number | null; value: number }>) =>
      new Map(list.map((r) => [r.nicheId, Number(r.value)]));
    const totalMap = map(totals);
    const assignedMap = map(assignedRows);
    const closedMap = map(closedRows);
    const agentMap = new Map<number, number>();
    for (const a of agentRows) {
      if (a.primaryNicheId) agentMap.set(a.primaryNicheId, (agentMap.get(a.primaryNicheId) ?? 0) + 1);
    }

    const visMap = new Map((visibilityRows ?? []).map((v) => [v.id, v.visibleToAgents]));

    const enriched = rows.map((n) => {
      const visibleToAgents = visMap.get(n.id) ?? true;
      return {
        ...n,
        total: totalMap.get(n.id) ?? 0,
        assigned: assignedMap.get(n.id) ?? 0,
        closed: closedMap.get(n.id) ?? 0,
        agents: agentMap.get(n.id) ?? 0,
        visibleToAgents,
        // how many of this niche's leads an agent would actually see
        agentVisibleLeads: visibleToAgents ? (assignedMap.get(n.id) ?? 0) : 0,
      };
    });

    // Every lead, including ones with no niche — what the "All niches" view shows.
    const allTotal = totals.reduce((sum, r) => sum + Number(r.value), 0);
    const uncategorised = Number(totals.find((r) => r.nicheId === null)?.value ?? 0);

    return ok({
      rows: enriched,
      canManage: true,
      canDelete: viewer.role === "ADMIN" || viewer.role === "HR",
      allTotal,
      uncategorised,
    });
  } catch (error) {
    return handleError(error);
  }
}

/** Add a new niche — immediately appears in the sidebar + category dropdowns. */
export async function POST(request: Request) {
  try {
    const staff = await requireStaff();
    const body = (await request.json()) as { name?: string; description?: string; color?: string; visibleToAgents?: boolean };
    const name = (body.name ?? "").trim();
    if (name.length < 2) return fail("Niche name must be at least 2 characters", 422);

    const slug =
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || `niche-${Date.now()}`;

    const existing = await db.select({ id: niches.id }).from(niches).where(eq(niches.slug, slug)).limit(1);
    if (existing.length) return fail("A niche with that name already exists", 409);

    const [row] = await db
      .insert(niches)
      .values({
        name,
        slug,
        description: body.description?.trim() || null,
        color: body.color ?? "#2563eb",
        visibleToAgents: body.visibleToAgents !== false,
      })
      .returning();

    await audit({ actorId: staff.id, actorRole: staff.role, action: "NICHE_CREATED", detail: name, meta: { nicheId: row!.id } });
    return ok({ niche: row }, 201);
  } catch (error) {
    return handleError(error);
  }
}

/** Rename / recolour / toggle a niche. */
export async function PATCH(request: Request) {
  try {
    const staff = await requireStaff();
    const body = (await request.json()) as {
      id?: number;
      name?: string;
      description?: string;
      color?: string;
      visibleToAgents?: boolean;
    };
    const id = Number(body.id ?? 0);
    if (!id) return fail("id required", 422);

    const patch: Record<string, unknown> = {};
    if (typeof body.name === "string" && body.name.trim().length >= 2) {
      patch.name = body.name.trim();
      patch.slug = body.name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
    }
    if (typeof body.description === "string") patch.description = body.description.trim() || null;
    if (typeof body.color === "string") patch.color = body.color;
    if (typeof body.visibleToAgents === "boolean") patch.visibleToAgents = body.visibleToAgents;
    if (Object.keys(patch).length === 0) return fail("Nothing to update", 422);

    const [row] = await db.update(niches).set(patch).where(eq(niches.id, id)).returning();
    if (!row) return fail("Niche not found", 404);

    await audit({
      actorId: staff.id,
      actorRole: staff.role,
      action: "NICHE_UPDATED",
      detail: `${row.name}${typeof body.visibleToAgents === "boolean" ? ` (visibleToAgents=${body.visibleToAgents})` : ""}`,
      meta: { nicheId: row.id },
    });
    return ok({ niche: row });
  } catch (error) {
    return handleError(error);
  }
}

/**
 * DELETE /api/niches?id=3   (ADMIN or HR)
 *
 * Removes a niche. Leads are NEVER deleted: they keep all their data and simply
 * become "uncategorised" (niche_id = NULL), so they stay reachable under the
 * "All niches" view. Agents / templates / lead requests that pointed at the
 * niche are detached in the same transaction.
 */
export async function DELETE(request: Request) {
  try {
    await ensureTables();
    const staff = await requireStaff();
    if (staff.role !== "ADMIN" && staff.role !== "HR") {
      return fail("Only ADMIN or HR can delete niches", 403);
    }
    const id = Number(new URL(request.url).searchParams.get("id") ?? 0);
    if (!Number.isInteger(id) || id <= 0) return fail("id required", 422);

    const [niche] = await db.select().from(niches).where(eq(niches.id, id)).limit(1);
    if (!niche) return fail("Niche not found", 404);

    const detached = await db.transaction(async (tx) => {
      const movedLeads = await tx.update(leads).set({ nicheId: null }).where(eq(leads.nicheId, id)).returning({ id: leads.id });
      const movedAgents = await tx
        .update(users)
        .set({ primaryNicheId: null })
        .where(eq(users.primaryNicheId, id))
        .returning({ id: users.id });
      await tx.update(templates).set({ nicheId: null }).where(eq(templates.nicheId, id));
      await tx.update(leadRequests).set({ nicheId: null }).where(eq(leadRequests.nicheId, id));
      await tx.delete(niches).where(eq(niches.id, id));
      return { leads: movedLeads.length, agents: movedAgents.length };
    });

    await audit({
      actorId: staff.id,
      actorRole: staff.role,
      action: "NICHE_DELETED",
      detail: `${niche.name} (${detached.leads} lead(s) kept as uncategorised)`,
      meta: { nicheId: id, ...detached },
    });
    return ok({ deleted: true, id, name: niche.name, leadsKept: detached.leads, agentsDetached: detached.agents });
  } catch (error) {
    return handleError(error);
  }
}
