/**
 * Backblaze B2 upload helper — Edge-runtime compatible.
 *
 * Talks to B2's S3-compatible API with plain `fetch` and Web Crypto
 * (`crypto.subtle`) — NO Node built-ins and NO AWS SDK — so it runs unchanged in
 * Node route handlers, Next.js Edge routes and Cloudflare/Vercel Edge functions.
 *
 * Environment variables
 *   B2_KEY_ID      application key ID            (required)
 *   B2_APP_KEY     application key secret        (required)
 *   B2_BUCKET      bucket name                   (required)
 *   B2_S3_REGION   e.g. "us-east-005"            (optional, default us-east-005)
 *   B2_PUBLIC_URL  public/CDN base URL           (optional)
 *                  e.g. "https://cdn.example.com" or
 *                       "https://f005.backblazeb2.com/file/<bucket>"
 *
 * Usage
 *   import { uploadToB2, deleteFromB2, presignGetUrl } from "@/utils/b2Storage";
 *   const { url, key } = await uploadToB2({ body: file, contentType: file.type, prefix: "kyc" });
 */

export type B2Config = {
  keyId: string;
  appKey: string;
  bucket: string;
  region: string;
  host: string;
  publicUrl: string | null;
};

export type B2UploadInput = {
  /** Object key. Generated (`<prefix>/<yyyy>/<mm>/<uuid>.<ext>`) when omitted. */
  key?: string;
  body: Blob | ArrayBuffer | Uint8Array | string;
  contentType?: string;
  /** Folder used when `key` is not provided. */
  prefix?: string;
  /** Original file name — only used to keep the extension on generated keys. */
  fileName?: string;
};

export type B2UploadResult = {
  key: string;
  /** URL to store: B2_PUBLIC_URL based when configured, else the bucket's S3 URL. */
  url: string;
  etag: string | null;
  size: number;
};

const DEFAULT_REGION = "us-east-005";
const REGION_RE = /^[a-z]{2}-[a-z]+-\d{3}$/i;
const enc = new TextEncoder();

/* ------------------------------------------------------------------ */
/* Config                                                             */
/* ------------------------------------------------------------------ */

export function getB2Config(): B2Config | null {
  const keyId = process.env.B2_KEY_ID?.trim();
  const appKey = process.env.B2_APP_KEY?.trim();
  const bucket = process.env.B2_BUCKET?.trim();
  if (!keyId || !appKey || !bucket) return null;

  // Tolerates loosely written values such as "US East" by falling back.
  const candidates = [process.env.B2_S3_REGION, process.env.B2_REGION, DEFAULT_REGION];
  const region = (candidates.map((c) => c?.trim()).find((c) => c && REGION_RE.test(c)) ?? DEFAULT_REGION).toLowerCase();

  return {
    keyId,
    appKey,
    bucket,
    region,
    host: `s3.${region}.backblazeb2.com`,
    publicUrl: normalisePublicUrl(process.env.B2_PUBLIC_URL),
  };
}

export function b2Configured(): boolean {
  return getB2Config() !== null;
}

/** Accepts "//host/path" and "host/path"; rejects the bare "backblazeb2.com" placeholder. */
function normalisePublicUrl(raw: string | undefined): string | null {
  let v = (raw ?? "").trim();
  if (!v) return null;
  if (v.startsWith("//")) v = `https:${v}`;
  else if (!/^https?:\/\//i.test(v)) v = `https://${v}`;
  try {
    const u = new URL(v);
    if (/^(www\.)?backblazeb2\.com$/i.test(u.hostname) && (u.pathname === "/" || u.pathname === "")) return null;
    return `${u.origin}${u.pathname.replace(/\/+$/, "")}`;
  } catch {
    return null;
  }
}

/** Public URL for a stored key. */
export function b2PublicUrl(key: string, cfg: B2Config | null = getB2Config()): string {
  if (!cfg) throw new Error("Backblaze B2 is not configured (B2_KEY_ID, B2_APP_KEY, B2_BUCKET)");
  const path = encodeKey(key);
  if (cfg.publicUrl) return `${cfg.publicUrl}/${path}`;
  return `https://${cfg.bucket}.${cfg.host}/${path}`;
}

/* ------------------------------------------------------------------ */
/* SigV4 primitives (Web Crypto)                                       */
/* ------------------------------------------------------------------ */

function toHex(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += bytes[i]!.toString(16).padStart(2, "0");
  return out;
}

async function sha256Hex(data: Uint8Array | string): Promise<string> {
  const bytes = typeof data === "string" ? enc.encode(data) : data;
  // copy into a fresh ArrayBuffer so SharedArrayBuffer-typed views are never passed to subtle
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return toHex(await crypto.subtle.digest("SHA-256", copy.buffer));
}

async function hmac(key: Uint8Array | ArrayBuffer, data: string): Promise<ArrayBuffer> {
  const raw = key instanceof Uint8Array ? key : new Uint8Array(key);
  const copy = new Uint8Array(raw.byteLength);
  copy.set(raw);
  const k = await crypto.subtle.importKey("raw", copy.buffer, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", k, enc.encode(data));
}

async function signingKey(secret: string, date: string, region: string): Promise<ArrayBuffer> {
  const kDate = await hmac(enc.encode(`AWS4${secret}`), date);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, "s3");
  return hmac(kService, "aws4_request");
}

/** RFC 3986 percent-encoding (stricter than encodeURIComponent). */
function rfc3986(v: string): string {
  return encodeURIComponent(v).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

function encodeKey(key: string): string {
  return key.split("/").map(rfc3986).join("/");
}

function amzDates(now = new Date()) {
  const iso = now.toISOString().replace(/[:-]|\.\d{3}/g, ""); // 20260101T120000Z
  return { amzDate: iso, dateStamp: iso.slice(0, 8) };
}

async function toBytes(body: B2UploadInput["body"]): Promise<Uint8Array> {
  if (typeof body === "string") return enc.encode(body);
  if (body instanceof Uint8Array) return body;
  if (body instanceof ArrayBuffer) return new Uint8Array(body);
  return new Uint8Array(await body.arrayBuffer());
}

/** Signs an S3 request with the Authorization header. */
async function signedRequest(
  cfg: B2Config,
  method: "PUT" | "DELETE" | "HEAD" | "GET",
  key: string,
  payload: Uint8Array | null,
  extraHeaders: Record<string, string> = {},
) {
  const { amzDate, dateStamp } = amzDates();
  const path = `/${rfc3986(cfg.bucket)}/${encodeKey(key)}`;
  const payloadHash = await sha256Hex(payload ?? "");

  const headers: Record<string, string> = {
    host: cfg.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
    ...Object.fromEntries(Object.entries(extraHeaders).map(([k, v]) => [k.toLowerCase(), v.trim()])),
  };
  const names = Object.keys(headers).sort();
  const canonicalHeaders = names.map((n) => `${n}:${headers[n]}\n`).join("");
  const signedHeaders = names.join(";");

  const canonicalRequest = [method, path, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const scope = `${dateStamp}/${cfg.region}/s3/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, await sha256Hex(canonicalRequest)].join("\n");
  const signature = toHex(await hmac(await signingKey(cfg.appKey, dateStamp, cfg.region), stringToSign));

  const { host: _host, ...sendHeaders } = headers; // fetch sets Host itself
  void _host;
  return {
    url: `https://${cfg.host}${path}`,
    headers: {
      ...sendHeaders,
      authorization: `AWS4-HMAC-SHA256 Credential=${cfg.keyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    } as Record<string, string>,
  };
}

/* ------------------------------------------------------------------ */
/* Public API                                                         */
/* ------------------------------------------------------------------ */

function generateKey(prefix: string | undefined, fileName: string | undefined, contentType: string | undefined) {
  const d = new Date();
  const extFromName = fileName && fileName.includes(".") ? fileName.split(".").pop()!.toLowerCase() : "";
  const extFromType = contentType?.split("/")[1]?.split(";")[0]?.replace("jpeg", "jpg") ?? "";
  const ext = (extFromName || extFromType || "bin").replace(/[^a-z0-9]/g, "").slice(0, 8) || "bin";
  const folder = (prefix ?? "uploads").replace(/^\/+|\/+$/g, "");
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${folder}/${d.getUTCFullYear()}/${month}/${crypto.randomUUID()}.${ext}`;
}

/** Uploads one object. Throws on failure with the B2 error message. */
export async function uploadToB2(input: B2UploadInput): Promise<B2UploadResult> {
  const cfg = getB2Config();
  if (!cfg) throw new Error("Backblaze B2 is not configured (B2_KEY_ID, B2_APP_KEY, B2_BUCKET)");

  const bytes = await toBytes(input.body);
  const contentType =
    input.contentType || (typeof input.body !== "string" && "type" in input.body && input.body.type) || "application/octet-stream";
  const key = (input.key ?? generateKey(input.prefix, input.fileName, contentType)).replace(/^\/+/, "");

  const req = await signedRequest(cfg, "PUT", key, bytes, { "content-type": contentType });
  const body = new Uint8Array(bytes.byteLength);
  body.set(bytes);
  const res = await fetch(req.url, { method: "PUT", headers: req.headers, body: body.buffer as ArrayBuffer });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const msg = /<Message>([^<]+)<\/Message>/.exec(text)?.[1] ?? text.slice(0, 200);
    throw new Error(`B2 upload failed (${res.status}): ${msg || res.statusText}`);
  }
  return {
    key,
    url: b2PublicUrl(key, cfg),
    etag: res.headers.get("etag")?.replace(/"/g, "") ?? null,
    size: bytes.byteLength,
  };
}

/** Deletes one object (succeeds if it is already gone). */
export async function deleteFromB2(key: string): Promise<void> {
  const cfg = getB2Config();
  if (!cfg) throw new Error("Backblaze B2 is not configured");
  const req = await signedRequest(cfg, "DELETE", key.replace(/^\/+/, ""), null);
  const res = await fetch(req.url, { method: "DELETE", headers: req.headers });
  if (!res.ok && res.status !== 404) throw new Error(`B2 delete failed (${res.status})`);
}

/**
 * Time-limited signed GET URL — use for PRIVATE buckets (e.g. KYC documents).
 * `expiresInSeconds` is capped at 7 days (S3 limit).
 */
export async function presignGetUrl(key: string, expiresInSeconds = 900): Promise<string> {
  const cfg = getB2Config();
  if (!cfg) throw new Error("Backblaze B2 is not configured");
  const { amzDate, dateStamp } = amzDates();
  const scope = `${dateStamp}/${cfg.region}/s3/aws4_request`;
  const path = `/${rfc3986(cfg.bucket)}/${encodeKey(key.replace(/^\/+/, ""))}`;

  const query: Record<string, string> = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${cfg.keyId}/${scope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(Math.min(Math.max(1, Math.floor(expiresInSeconds)), 604800)),
    "X-Amz-SignedHeaders": "host",
  };
  const canonicalQuery = Object.keys(query)
    .sort()
    .map((k) => `${rfc3986(k)}=${rfc3986(query[k]!)}`)
    .join("&");

  const canonicalRequest = ["GET", path, canonicalQuery, `host:${cfg.host}\n`, "host", "UNSIGNED-PAYLOAD"].join("\n");
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, await sha256Hex(canonicalRequest)].join("\n");
  const signature = toHex(await hmac(await signingKey(cfg.appKey, dateStamp, cfg.region), stringToSign));
  return `https://${cfg.host}${path}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}
