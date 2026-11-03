"use client";

import { useEffect, useState } from "react";
import {
  Download,
  ExternalLink,
  File as FileIcon,
  FileArchive,
  FileAudio,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  Loader2,
  Maximize2,
  Presentation,
  X,
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { SecureLink } from "@/components/shared/secure-link";
import { cn } from "@/lib/utils";

export type ChatAttachment = {
  id: number;
  /** secure proxy URL — /api/files/:id (private B2 bucket, access-controlled) */
  url: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
};

type Kind = "image" | "pdf" | "text" | "audio" | "word" | "sheet" | "slides" | "archive" | "other";

export function attachmentKind(mime: string, fileName: string): Kind {
  const m = (mime || "").toLowerCase();
  const ext = fileName.includes(".") ? fileName.split(".").pop()!.toLowerCase() : "";
  if (m.startsWith("image/")) return "image";
  if (m === "application/pdf" || ext === "pdf") return "pdf";
  if (m === "text/plain" || m === "text/csv" || ext === "txt" || ext === "csv") return "text";
  if (m.startsWith("audio/")) return "audio";
  if (m.includes("wordprocessingml") || m === "application/msword" || ext === "doc" || ext === "docx") return "word";
  if (m.includes("spreadsheetml") || m === "application/vnd.ms-excel" || ext === "xls" || ext === "xlsx") return "sheet";
  if (m.includes("presentationml") || m === "application/vnd.ms-powerpoint" || ext === "ppt" || ext === "pptx") return "slides";
  if (m.includes("zip") || ext === "zip") return "archive";
  return "other";
}

const KIND_META: Record<Kind, { label: string; Icon: typeof FileIcon; tone: string }> = {
  image: { label: "Image", Icon: ImageIcon, tone: "bg-sky-100 text-sky-700" },
  pdf: { label: "PDF", Icon: FileText, tone: "bg-rose-100 text-rose-700" },
  text: { label: "Text", Icon: FileText, tone: "bg-slate-100 text-slate-700" },
  audio: { label: "Audio", Icon: FileAudio, tone: "bg-violet-100 text-violet-700" },
  word: { label: "Word document", Icon: FileText, tone: "bg-blue-100 text-blue-700" },
  sheet: { label: "Spreadsheet", Icon: FileSpreadsheet, tone: "bg-emerald-100 text-emerald-700" },
  slides: { label: "Presentation", Icon: Presentation, tone: "bg-orange-100 text-orange-700" },
  archive: { label: "Archive", Icon: FileArchive, tone: "bg-amber-100 text-amber-700" },
  other: { label: "File", Icon: FileIcon, tone: "bg-slate-100 text-slate-600" },
};

export function sizeLabel(bytes: number | null | undefined) {
  const b = bytes ?? 0;
  if (b >= 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  if (b >= 1024) return `${Math.round(b / 1024)} KB`;
  return `${b} B`;
}

/** Small round icon for a file type (used by cards and the composer chip). */
export function FileTypeBadge({ mime, fileName, className }: { mime: string; fileName: string; className?: string }) {
  const { Icon, tone } = KIND_META[attachmentKind(mime, fileName)];
  return (
    <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", tone, className)}>
      <Icon className="h-5 w-5" />
    </span>
  );
}

/** Open (new tab) + Download. Download must be a real <a download> — it can't go through router.push(). */
function Actions({ a }: { a: ChatAttachment }) {
  return (
    <div className="flex items-center gap-1.5">
      <SecureLink
        href={a.url}
        target="_blank"
        className="inline-flex items-center gap-1 rounded-md border bg-white px-2 py-1 text-[10px] font-bold text-blue-700 hover:bg-blue-50"
      >
        <ExternalLink className="h-3 w-3" /> Open
      </SecureLink>
      <a
        href={`${a.url}?dl=1`}
        download={a.fileName}
        className="inline-flex items-center gap-1 rounded-md border bg-white px-2 py-1 text-[10px] font-bold text-slate-700 hover:bg-slate-50"
      >
        <Download className="h-3 w-3" /> Save
      </a>
    </div>
  );
}

function FileCard({ a, note }: { a: ChatAttachment; note?: string }) {
  const kind = attachmentKind(a.mimeType, a.fileName);
  return (
    <div className="flex items-center gap-2.5 p-2.5">
      <FileTypeBadge mime={a.mimeType} fileName={a.fileName} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-bold text-slate-900" title={a.fileName}>
          {a.fileName}
        </p>
        <p className="text-[10px] text-slate-500">
          {KIND_META[kind].label} · {sizeLabel(a.sizeBytes)}
          {note ? ` · ${note}` : ""}
        </p>
        <div className="mt-1.5">
          <Actions a={a} />
        </div>
      </div>
    </div>
  );
}

function Lightbox({
  a,
  kind,
  open,
  onClose,
}: {
  a: ChatAttachment;
  kind: "image" | "pdf";
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent fullscreen hideClose className="bg-slate-950 p-0 sm:rounded-none">
        <DialogTitle className="sr-only">{a.fileName}</DialogTitle>
        <div className="flex items-center gap-2 border-b border-white/10 bg-slate-900 px-3 py-2 text-white">
          <p className="min-w-0 flex-1 truncate text-sm font-semibold">{a.fileName}</p>
          <span className="hidden text-[11px] text-white/60 sm:inline">{sizeLabel(a.sizeBytes)}</span>
          <a
            href={`${a.url}?dl=1`}
            download={a.fileName}
            className="inline-flex items-center gap-1 rounded-md bg-white/10 px-2.5 py-1.5 text-xs font-semibold hover:bg-white/20"
          >
            <Download className="h-3.5 w-3.5" /> Save
          </a>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close preview"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 hover:bg-white/20"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-2">
          {kind === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={a.url} alt={a.fileName} className="max-h-full max-w-full rounded object-contain" />
          ) : (
            <iframe src={a.url} title={a.fileName} className="h-[calc(100dvh-4rem)] w-full rounded bg-white" />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TextSnippet({ a }: { a: ChatAttachment }) {
  const [text, setText] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(a.url, { headers: { Range: "bytes=0-2047" } });
        if (!res.ok && res.status !== 206) throw new Error("bad status");
        const raw = (await res.text()).slice(0, 1200);
        if (alive) setText(raw);
      } catch {
        if (alive) setFailed(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [a.url]);

  if (failed) return <FileCard a={a} />;
  return (
    <div>
      <div className="max-h-28 overflow-hidden border-b bg-slate-50 p-2">
        {text === null ? (
          <p className="flex items-center gap-1.5 text-[10px] text-slate-400">
            <Loader2 className="h-3 w-3 animate-spin" /> Loading preview…
          </p>
        ) : (
          <pre data-allow-select="true" className="whitespace-pre-wrap break-words font-mono text-[10px] leading-snug text-slate-700">
            {text}
          </pre>
        )}
      </div>
      <FileCard a={a} />
    </div>
  );
}

/**
 * Renders a chat attachment inline:
 *   image  → thumbnail, click to open a full-screen viewer
 *   PDF    → live inline viewer + full-screen expand
 *   text   → first lines of the file
 *   audio  → player
 *   Word / Excel / PowerPoint / zip / other → file card (name, type, size, Open, Save)
 *
 * Files are always read through the secure proxy (/api/files/:id), never a public B2 URL.
 */
export function AttachmentPreview({ attachment: a, className }: { attachment: ChatAttachment; className?: string }) {
  const kind = attachmentKind(a.mimeType, a.fileName);
  const [open, setOpen] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);

  const shell = cn("mt-1.5 w-full max-w-[18rem] overflow-hidden rounded-xl border bg-white text-slate-800 shadow-sm", className);

  if (kind === "image" && !imgFailed) {
    return (
      <div className={shell}>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="relative block w-full bg-slate-100"
          aria-label={`Preview ${a.fileName}`}
        >
          {!imgLoaded ? (
            <span className="absolute inset-0 flex items-center justify-center text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" />
            </span>
          ) : null}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={a.url}
            alt={a.fileName}
            loading="lazy"
            onLoad={() => setImgLoaded(true)}
            onError={() => setImgFailed(true)}
            className="max-h-56 min-h-16 w-full object-cover"
          />
          <span className="absolute bottom-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-slate-900/70 text-white">
            <Maximize2 className="h-3 w-3" />
          </span>
        </button>
        <div className="flex items-center justify-between gap-2 border-t px-2.5 py-1.5">
          <p className="min-w-0 truncate text-[10px] font-semibold text-slate-600" title={a.fileName}>
            {a.fileName} · {sizeLabel(a.sizeBytes)}
          </p>
          <Actions a={a} />
        </div>
        <Lightbox a={a} kind="image" open={open} onClose={() => setOpen(false)} />
      </div>
    );
  }

  if (kind === "pdf") {
    return (
      <div className={shell}>
        <div className="relative h-52 bg-slate-100">
          <iframe
            src={`${a.url}#toolbar=0&navpanes=0&view=FitH`}
            title={a.fileName}
            loading="lazy"
            className="h-full w-full bg-white"
          />
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label={`Expand ${a.fileName}`}
            className="absolute right-1.5 top-1.5 flex h-7 items-center gap-1 rounded-full bg-slate-900/75 px-2 text-[10px] font-bold text-white hover:bg-slate-900"
          >
            <Maximize2 className="h-3 w-3" /> Expand
          </button>
        </div>
        <div className="border-t">
          <FileCard a={a} />
        </div>
        <Lightbox a={a} kind="pdf" open={open} onClose={() => setOpen(false)} />
      </div>
    );
  }

  if (kind === "text") {
    return (
      <div className={shell}>
        <TextSnippet a={a} />
      </div>
    );
  }

  if (kind === "audio") {
    return (
      <div className={shell}>
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <audio controls preload="none" src={a.url} className="h-10 w-full" />
        <div className="border-t">
          <FileCard a={a} />
        </div>
      </div>
    );
  }

  return (
    <div className={shell}>
      <FileCard a={a} note={kind === "word" || kind === "sheet" || kind === "slides" ? "open to view" : undefined} />
    </div>
  );
}
