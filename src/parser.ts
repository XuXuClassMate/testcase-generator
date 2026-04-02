import fs from "fs";
import path from "path";
import { ParsedContent, InputType } from "./types";
import { parseVideoBuffer, isVideoFile } from "./video-parser";

// ─── File Parser ──────────────────────────────────────────────────────────────
// Lazy-loads heavy deps to avoid startup cost in OpenClaw gateway mode

export async function parseFile(filePath: string): Promise<ParsedContent> {
  const ext = path.extname(filePath).toLowerCase().replace(".", "");
  const source = path.basename(filePath);

  switch (ext) {
    case "pdf":
      return parsePdf(filePath, source);
    case "docx":
      return parseDocx(filePath, source);
    case "txt":
      return parseTxt(filePath, source);
    case "jpg":
    case "jpeg":
    case "png":
    case "gif":
    case "webp":
      return parseImage(filePath, source);
    default:
      // Fallback: try as plain text
      return parseTxt(filePath, source);
  }
}

export async function parseBuffer(
  buffer: Buffer,
  originalName: string,
  mimeType: string
): Promise<ParsedContent> {
  const source = originalName;

  if (mimeType === "application/pdf") {
    return parsePdfBuffer(buffer, source);
  }

  if (
    mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    originalName.endsWith(".docx")
  ) {
    return parseDocxBuffer(buffer, source);
  }

  if (mimeType.startsWith("image/")) {
    const base64 = buffer.toString("base64");
    return {
      text: `[图片文件: ${source}]`,
      images: [`data:${mimeType};base64,${base64}`],
      source,
      inputType: "image",
    };
  }

  if (isVideoFile(mimeType, originalName)) {
    return parseVideoBuffer(buffer, originalName);
  }

  if (mimeType.startsWith("text/")) {
    return {
      text: buffer.toString("utf-8"),
      images: [],
      source,
      inputType: "txt",
    };
  }

  return { text: buffer.toString("utf-8"), images: [], source, inputType: "txt" };
}

// ─── Parsers ──────────────────────────────────────────────────────────────────

async function parsePdf(filePath: string, source: string): Promise<ParsedContent> {
  const buffer = fs.readFileSync(filePath);
  return parsePdfBuffer(buffer, source);
}

async function parsePdfBuffer(buffer: Buffer, source: string): Promise<ParsedContent> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require("pdf-parse") as (buf: Buffer) => Promise<{ text: string }>;
  const result = await pdfParse(buffer);
  return { text: result.text, images: [], source, inputType: "pdf" };
}

async function parseDocx(filePath: string, source: string): Promise<ParsedContent> {
  const buffer = fs.readFileSync(filePath);
  return parseDocxBuffer(buffer, source);
}

async function parseDocxBuffer(buffer: Buffer, source: string): Promise<ParsedContent> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mammoth = require("mammoth") as {
    extractRawText: (opts: { buffer: Buffer }) => Promise<{ value: string }>;
  };
  const result = await mammoth.extractRawText({ buffer });
  return { text: result.value, images: [], source, inputType: "docx" };
}

function parseTxt(filePath: string, source: string): ParsedContent {
  const text = fs.readFileSync(filePath, "utf-8");
  return { text, images: [], source, inputType: "txt" };
}

async function parseImage(filePath: string, source: string): Promise<ParsedContent> {
  const buffer = fs.readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase().replace(".", "");
  const mimeMap: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
  };
  const mimeType = mimeMap[ext] ?? "image/jpeg";
  const base64 = buffer.toString("base64");
  return {
    text: `[图片文件: ${source}]`,
    images: [`data:${mimeType};base64,${base64}`],
    source,
    inputType: "image",
  };
}

// ─── Dedup & merge multiple parsed contents ───────────────────────────────────

export function mergeContents(contents: ParsedContent[]): string {
  const seen = new Set<string>();
  const parts: string[] = [];

  for (const c of contents) {
    // Simple paragraph-level dedup
    const paragraphs = c.text.split(/\n{2,}/);
    const unique = paragraphs.filter((p) => {
      const key = p.trim().slice(0, 100);
      if (seen.has(key) || key.length < 5) return false;
      seen.add(key);
      return true;
    });
    if (unique.length > 0) {
      parts.push(`### 来源: ${c.source}\n\n${unique.join("\n\n")}`);
    }
  }

  return parts.join("\n\n---\n\n");
}
