import { ensureTables } from "@/db/bootstrap";
import { handleError, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { getPublicFlags } from "@/lib/settings";

export const dynamic = "force-dynamic";

/** GET /api/settings/public — non-sensitive feature flags for any signed-in user. */
export async function GET() {
  try {
    await ensureTables();
    await requireUser();
    return ok({ flags: await getPublicFlags() });
  } catch (error) {
    return handleError(error);
  }
}
