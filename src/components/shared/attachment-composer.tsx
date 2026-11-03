"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Lock, Paperclip, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FileTypeBadge, sizeLabel, type ChatAttachment } from "@/components/shared/attachment-preview";

export const ATTACH_ACCEPT = "image/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip";
export const ATTACH_MAX_BYTES = 25 * 1024 * 1024;

/** Mirrors the server allow-list in /api/upload (the server is the real gatekeeper). */
const OK_TYPE =
  /^(image\/(png|jpe?g|webp|gif|heic|heif)|application\/(pdf|msword|vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet|presentationml\.presentation)|vnd\.ms-(excel|powerpoint)|zip|x-zip-compressed)|text\/(plain|csv))$/i;

export type PendingAttachment = ChatAttachment & { localPreview?: string };

/**
 * Uploads ONE chat attachment to Backblaze B2 via POST /api/upload (strict mode:
 * the server refuses to fall back to database storage). Returns the stored file
 * as a secure proxy reference ready to be sent with a message.
 */
export function useAttachmentUpload(kind = "TICKET_CHAT") {
  const [pending, setPending] = useState<PendingAttachment | null>(null);
  const [uploading, setUploading] = useState(false);
  const preview = useRef<string | undefined>(undefined);

  const revoke = () => {
    if (preview.current) URL.revokeObjectURL(preview.current);
    preview.current = undefined;
  };

  useEffect(() => revoke, []);

  const clear = useCallback(() => {
    revoke();
    setPending(null);
  }, []);

  const attach = useCallback(
    async (file: File) => {
      if (file.size > ATTACH_MAX_BYTES) {
        toast.error("File too large (max 25 MB)");
        return null;
      }
      if (!OK_TYPE.test(file.type)) {
        toast.error("Unsupported file. Attach an image, PDF, Word/Excel/PowerPoint, text or zip file.");
        return null;
      }
      revoke();
      setPending(null);
      setUploading(true);
      try {
        const body = new FormData();
        body.append("file", file);
        body.append("kind", kind);
        body.append("requireB2", "1");
        const res = await fetch("/api/upload", { method: "POST", body });
        const json = (await res.json().catch(() => ({}))) as {
          id?: number;
          proxyUrl?: string;
          name?: string;
          size?: number;
          mimeType?: string;
          driver?: string;
          error?: string;
        };
        if (!res.ok || !json.id) {
          toast.error(json.error ?? `Upload failed (${res.status})`);
          return null;
        }
        const local = file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined;
        preview.current = local;
        const next: PendingAttachment = {
          id: json.id,
          url: json.proxyUrl ?? `/api/files/${json.id}`,
          fileName: json.name ?? file.name,
          mimeType: json.mimeType ?? file.type,
          sizeBytes: json.size ?? file.size,
          localPreview: local,
        };
        setPending(next);
        return next;
      } catch {
        toast.error("Network error — attachment not uploaded");
        return null;
      } finally {
        setUploading(false);
      }
    },
    [kind],
  );

  return { pending, uploading, attach, clear };
}

type Upload = ReturnType<typeof useAttachmentUpload>;

/** Paperclip button that opens the file picker and uploads the chosen file. */
export function AttachButton({
  att,
  label,
  iconOnly = false,
  disabled,
  className,
}: {
  att: Upload;
  label?: string;
  iconOnly?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLInputElement | null>(null);
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept={ATTACH_ACCEPT}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void att.attach(f);
        }}
      />
      <Button
        type="button"
        variant="outline"
        size={iconOnly ? "icon" : "default"}
        disabled={disabled || att.uploading}
        onClick={() => ref.current?.click()}
        aria-label={label ?? "Attach file"}
        title={label ?? "Attach file"}
        className={className}
      >
        {att.uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
        {iconOnly ? null : (label ?? "Attach file")}
      </Button>
    </>
  );
}

/** The file that is about to be sent: thumbnail / icon, name, size and a remove button. */
export function AttachmentChip({ att }: { att: Upload }) {
  if (att.uploading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
        <Loader2 className="h-4 w-4 animate-spin" /> Uploading to secure storage…
      </div>
    );
  }
  const p = att.pending;
  if (!p) return null;
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 p-2">
      {p.localPreview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={p.localPreview} alt={p.fileName} className="h-10 w-10 shrink-0 rounded-lg object-cover" />
      ) : (
        <FileTypeBadge mime={p.mimeType} fileName={p.fileName} />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-bold text-slate-900" title={p.fileName}>
          {p.fileName}
        </p>
        <p className="flex items-center gap-1 text-[10px] text-emerald-700">
          <Lock className="h-2.5 w-2.5" /> Stored securely in Backblaze B2 · {sizeLabel(p.sizeBytes)}
        </p>
      </div>
      <button
        type="button"
        onClick={att.clear}
        aria-label="Remove attachment"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-slate-500 shadow-sm hover:text-rose-600"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
