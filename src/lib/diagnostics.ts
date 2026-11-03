import { sql } from "drizzle-orm";
import { db } from "@/db";
import { describeDatabaseUrl, sanitizeDatabaseUrl } from "@/lib/db-url";

export type EnvEntry = { key: string; value: string; secret: boolean; set: boolean };

export type Diagnostics = {
  database: {
    status: "up" | "down";
    latencyMs: number | null;
    host: string;
    database: string;
    driver: string;
    user: string | null;
    version: string | null;
    serverTime: string | null;
    error: string | null;
    /** connection string with the password masked */
    connection: string;
  };
  env: EnvEntry[];
  generatedAt: string;
};

/** Variables the site is expected to load — always listed, even when unset. */
const EXPECTED = [
  "DATABASE_URL",
  "AUTH_SECRET",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "B2_KEY_ID",
  "B2_APP_KEY",
  "B2_BUCKET",
  "B2_PUBLIC_URL",
  "B2_REGION",
  "B2_S3_REGION",
  "NODE_ENV",
];

/** Anything else matching these prefixes is shown too. */
const EXTRA = /^(B2_|SUPABASE_|NEXT_PUBLIC_|AUTH_|DATABASE_|PGSSL|VERCEL_|PORT$|HOSTNAME$)/;
const SECRET = /(SECRET|KEY|PASSWORD|TOKEN|DATABASE_URL|PRIVATE)/i;

/** Never returns a full secret: keeps a short prefix/suffix for recognition. */
function mask(value: string): string {
  if (value.length <= 8) return "••••••";
  return `${value.slice(0, 4)}••••••••${value.slice(-2)}`;
}

function maskConnection(raw: string | undefined): string {
  const s = sanitizeDatabaseUrl(raw);
  try {
    const u = new URL(s);
    return `${u.protocol}//${decodeURIComponent(u.username)}:••••••@${u.host}${u.pathname}`;
  } catch {
    return "unconfigured";
  }
}

export function loadedEnv(): EnvEntry[] {
  const keys = new Set<string>(EXPECTED);
  for (const k of Object.keys(process.env)) if (EXTRA.test(k)) keys.add(k);
  return [...keys]
    .sort((a, b) => a.localeCompare(b))
    .map((key) => {
      const raw = process.env[key];
      const set = typeof raw === "string" && raw.length > 0;
      const secret = SECRET.test(key);
      return {
        key,
        set,
        secret,
        value: !set ? "" : key === "DATABASE_URL" ? maskConnection(raw) : secret ? mask(raw!) : raw!,
      };
    });
}

export async function getDiagnostics(): Promise<Diagnostics> {
  const target = describeDatabaseUrl(process.env.DATABASE_URL);
  let status: "up" | "down" = "down";
  let latencyMs: number | null = null;
  let user: string | null = null;
  let version: string | null = null;
  let serverTime: string | null = null;
  let error: string | null = null;
  try {
    const t0 = Date.now();
    const res = await db.execute<{ u: string; v: string; t: string }>(
      sql`select current_user as u, version() as v, now()::text as t`,
    );
    latencyMs = Date.now() - t0;
    status = "up";
    const row = res.rows[0];
    user = row?.u ?? null;
    version = row?.v?.split(" on ")[0] ?? null;
    serverTime = row?.t ?? null;
  } catch (e) {
    error = e instanceof Error ? e.message : "connection failed";
  }
  return {
    database: {
      status,
      latencyMs,
      host: target.host,
      database: target.database,
      driver: target.isSupabase ? "Supabase Postgres" : "PostgreSQL",
      user,
      version,
      serverTime,
      error,
      connection: maskConnection(process.env.DATABASE_URL),
    },
    env: loadedEnv(),
    generatedAt: new Date().toISOString(),
  };
}
