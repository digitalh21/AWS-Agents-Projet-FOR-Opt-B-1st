import { sql } from "drizzle-orm";
import { db } from "@/db";
import { BOOTSTRAP_SQL } from "@/db/bootstrap-sql";

let applied: Promise<void> | null = null;

/**
 * Ensures every table and index exists.
 *
 * Runs once per process and is idempotent, so a brand-new Postgres or Supabase
 * project self-provisions on the first request instead of returning 500s.
 */
export async function ensureTables() {
  if (!applied) {
    applied = (async () => {
      // One-time migration: the legacy pipeline workflow table used to be
      // called "leads". Free that name for the strict 18-column lead sheet.
      const legacy = await db.execute(sql`
        select
          exists (select 1 from information_schema.columns
                  where table_schema = current_schema() and table_name = 'leads' and column_name = 'business_name') as legacy_leads,
          exists (select 1 from information_schema.tables
                  where table_schema = current_schema() and table_name = 'pipeline_leads') as has_pipeline
      `);
      const flags = legacy.rows[0] as { legacy_leads?: boolean; has_pipeline?: boolean } | undefined;
      if (flags?.legacy_leads && !flags?.has_pipeline) {
        await db.execute(sql.raw('ALTER TABLE "leads" RENAME TO "pipeline_leads"'));
      }

      const statements = BOOTSTRAP_SQL.split(";")
        .map((chunk) =>
          chunk
            .split("\n")
            .filter((line) => !line.trim().startsWith("--"))
            .join("\n")
            .trim(),
        )
        .filter(Boolean);

      for (const statement of statements) {
        await db.execute(sql.raw(statement));
      }
    })().catch((error) => {
      applied = null;
      throw error;
    });
  }
  return applied;
}
