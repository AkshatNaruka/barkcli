/**
 * Prompt attachments system for thread conversations.
 * Allows users to attach any file (images, code files, documents, configuration)
 * to a prompt, matching modern AI thread environments like T3 Code.
 */

import type { ThreadEvent } from "./types";

export interface PromptAttachment {
  id: string;
  name: string;
  size: number;
  type: string;
  /** base64 data URI for preview & sending (especially for images) */
  dataUrl?: string;
  /** text content if readable text file (bounded to prevent huge memory spikes) */
  textContent?: string;
  isImage: boolean;
}

const TEXT_FILE_EXTENSIONS = new Set([
  "txt", "md", "markdown", "json", "js", "jsx", "ts", "tsx", "rs", "py", "rb", "go",
  "c", "cpp", "h", "hpp", "java", "kt", "swift", "php", "html", "css", "scss", "sass",
  "yaml", "yml", "toml", "sh", "bash", "zsh", "sql", "xml", "env", "lock", "diff", "patch"
]);

export function isImageFile(fileName: string, mimeType: string = ""): boolean {
  if (mimeType.startsWith("image/")) return true;
  return /\.(png|jpe?g|gif|webp|svg|bmp|ico)$/i.test(fileName);
}

export function isTextFile(fileName: string, mimeType: string = ""): boolean {
  if (mimeType.startsWith("text/")) return true;
  const ext = fileName.split(".").pop()?.toLowerCase();
  return ext ? TEXT_FILE_EXTENSIONS.has(ext) : false;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Max text size in bytes to read directly into prompt (500 KB) */
export const MAX_ATTACHMENT_TEXT_SIZE = 500 * 1024;

/**
 * Converts a browser File object to a PromptAttachment.
 */
export async function fileToPromptAttachment(file: File): Promise<PromptAttachment> {
  const isImg = isImageFile(file.name, file.type);
  const isTxt = isTextFile(file.name, file.type);
  const id = `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  let dataUrl: string | undefined;
  let textContent: string | undefined;

  if (isImg) {
    dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error || new Error("Failed to read image file"));
      reader.readAsDataURL(file);
    });
  } else if (isTxt && file.size <= MAX_ATTACHMENT_TEXT_SIZE) {
    textContent = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error || new Error("Failed to read text file"));
      reader.readAsText(file);
    });
  } else {
    // Other binary files: read dataUrl for storage/preview
    dataUrl = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => resolve("");
      reader.readAsDataURL(file);
    });
  }

  return {
    id,
    name: file.name,
    size: file.size,
    type: file.type || "application/octet-stream",
    dataUrl,
    textContent,
    isImage: isImg,
  };
}

/**
 * Format prompt text with attachments so that downstream LLM agents
 * (Claude Code, OpenCode, Codex, GPT-4o, etc.) receive clean, structured context
 * about every attached file and image.
 */
export function formatPromptWithAttachments(
  prompt: string,
  attachments: PromptAttachment[]
): string {
  const trimmed = prompt.trim();
  if (!attachments || attachments.length === 0) return trimmed;

  const sections: string[] = [];
  if (trimmed) {
    sections.push(trimmed);
  }

  const fileCount = attachments.length;
  sections.push(`\n\n--- Attached Files (${fileCount}) ---`);

  for (const att of attachments) {
    const formattedSize = formatFileSize(att.size);
    if (att.isImage) {
      if (att.dataUrl) {
        sections.push(
          `\n[Image: ${att.name} (${formattedSize})]\n![${att.name}](${att.dataUrl})`
        );
      } else {
        sections.push(`\n[Image: ${att.name} (${formattedSize})]`);
      }
    } else if (att.textContent) {
      const ext = att.name.split(".").pop()?.toLowerCase() || "";
      sections.push(
        `\n[File: ${att.name} (${formattedSize})]\n\`\`\`${ext}\n${att.textContent}\n\`\`\``
      );
    } else {
      sections.push(`\n[File: ${att.name} (${formattedSize})]`);
    }
  }

  return sections.join("\n").trim();
}

/**
 * Extracts prompt attachments from a thread event, either from its
 * structured `data.attachments` field or by parsing markdown attachments.
 */
export function extractAttachmentsFromEvent(event: ThreadEvent): PromptAttachment[] {
  if (event.data?.attachments && Array.isArray(event.data.attachments)) {
    return event.data.attachments;
  }

  // Parse attached markdown image references if present in text
  const results: PromptAttachment[] = [];
  const imgRegex = /!\[([^\]]*)\]\((data:image\/[^;]+;base64,[^)]+)\)/g;
  let match: RegExpExecArray | null;
  while ((match = imgRegex.exec(event.text)) !== null) {
    const name = match[1] || "attached-image.png";
    const dataUrl = match[2];
    results.push({
      id: `parsed-${results.length}-${name}`,
      name,
      size: Math.round((dataUrl.length * 3) / 4),
      type: "image/png",
      dataUrl,
      isImage: true,
    });
  }

  return results;
}
