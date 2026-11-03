import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { uploads } from "@/db/schema";

/** Attachments are stored as the secure proxy URL of an `uploads` row. */
const FILE_URL = /^\/api\/files\/(\d+)$/;

export type AttachmentMeta = {
  id: number;
  url: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
};

export function uploadIdFromUrl(url: string | null | undefined): number | null {
  const m = FILE_URL.exec((url ?? "").trim());
  return m ? Number(m[1]) : null;
}

/**
 * Validates an attachment reference posted by a user.
 *
 * Only files the SAME user uploaded, and that actually live in Backblaze B2, may
 * be attached — so nobody can attach another person's file id to gain read access.
 */
export async function validateAttachment(
  raw: string | null | undefined,
  userId: string,
): Promise<{ ok: true; url: string | null } | { ok: false; error: string }> {
  const url = (raw ?? "").trim();
  if (!url) return { ok: true, url: null };
  const id = uploadIdFromUrl(url);
  if (!id) return { ok: false, error: "Invalid attachment — please upload the file again." };

  const [row] = await db
    .select({ userId: uploads.userId, driver: uploads.storageDriver })
    .from(uploads)
    .where(inArray(uploads.id, [id]))
    .limit(1);
  if (!row || row.userId !== userId) return { ok: false, error: "Attachment not found — please upload it again." };
  if (row.driver !== "b2") return { ok: false, error: "Attachment is not stored in Backblaze B2." };
  return { ok: true, url: `/api/files/${id}` };
}

/** Looks up file name / type / size for a set of attachment URLs. */
export async function attachmentMeta(urls: Array<string | null | undefined>): Promise<Map<string, AttachmentMeta>> {
  const ids = [...new Set(urls.map(uploadIdFromUrl).filter((v): v is number => v !== null))];
  const out = new Map<string, AttachmentMeta>();
  if (ids.length === 0) return out;
  const rows = await db
    .select({
      id: uploads.id,
      fileName: uploads.fileName,
      mimeType: uploads.mimeType,
      sizeBytes: uploads.sizeBytes,
    })
    .from(uploads)
    .where(inArray(uploads.id, ids));
  for (const r of rows) {
    const url = `/api/files/${r.id}`;
    out.set(url, {
      id: r.id,
      url,
      fileName: r.fileName ?? `file-${r.id}`,
      mimeType: r.mimeType ?? "application/octet-stream",
      sizeBytes: r.sizeBytes ?? 0,
    });
  }
  return out;
}
