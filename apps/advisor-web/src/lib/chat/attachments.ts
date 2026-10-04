import type { AttachmentProblem } from "../i18n";
import { MAX_TEXT_CHARS } from "./api-types";
import type { AttachmentMeta } from "./types";

export type PendingAttachment = AttachmentMeta & { data: string };

export class AttachmentError extends Error {
  problem: AttachmentProblem;
  constructor(problem: AttachmentProblem) {
    super(problem.kind);
    this.problem = problem;
  }
}

const MAX_IMAGE_INPUT_BYTES = 15 * 1024 * 1024;
const MAX_IMAGE_EDGE = 1568; // larger images gain nothing, they just cost tokens
const THUMB_EDGE = 96;

const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const TEXT_EXTENSIONS = new Set([
  "txt", "md", "csv", "json", "xml", "log", "sql", "yaml", "yml", "html", "htm", "ini", "properties",
]);

export const ACCEPT = [...IMAGE_TYPES, ...[...TEXT_EXTENSIONS].map((e) => `.${e}`)].join(",");

const uid = () => crypto.randomUUID();

function drawScaled(bitmap: ImageBitmap, maxEdge: number) {
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not process the image in this browser.");
  ctx.fillStyle = "#fff"; // JPEG has no transparency
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas;
}

async function processImage(file: File): Promise<PendingAttachment> {
  if (file.size > MAX_IMAGE_INPUT_BYTES) throw new AttachmentError({ kind: "imageTooBig", file: file.name });
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new AttachmentError({ kind: "unreadableImage", file: file.name });
  }
  const full = drawScaled(bitmap, MAX_IMAGE_EDGE).toDataURL("image/jpeg", 0.85);
  const thumbnail = drawScaled(bitmap, THUMB_EDGE).toDataURL("image/jpeg", 0.7);
  bitmap.close();
  return {
    id: uid(),
    name: file.name,
    kind: "image",
    mimeType: "image/jpeg",
    size: file.size,
    thumbnail,
    data: full.split(",")[1],
  };
}

async function processText(file: File): Promise<PendingAttachment> {
  const text = await file.text();
  if (text.includes("\u0000")) throw new AttachmentError({ kind: "binaryFile", file: file.name });
  if (text.length > MAX_TEXT_CHARS) {
    throw new AttachmentError({ kind: "textTooLong", file: file.name, max: MAX_TEXT_CHARS });
  }
  return { id: uid(), name: file.name, kind: "text", mimeType: file.type || "text/plain", size: file.size, data: text };
}

export async function processFile(file: File): Promise<PendingAttachment> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (IMAGE_TYPES.has(file.type)) return processImage(file);
  if (file.type.startsWith("text/") || file.type === "application/json" || TEXT_EXTENSIONS.has(ext)) {
    return processText(file);
  }
  throw new AttachmentError({ kind: "unsupported", file: file.name });
}

export function toMeta({ data: _data, ...meta }: PendingAttachment): AttachmentMeta {
  void _data;
  return meta;
}
