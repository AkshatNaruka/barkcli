import { describe, expect, it } from "vitest";
import {
  formatFileSize,
  isImageFile,
  isTextFile,
  formatPromptWithAttachments,
  extractAttachmentsFromEvent,
  type PromptAttachment,
} from "./attachments";
import type { ThreadEvent } from "./types";

describe("attachments library", () => {
  it("formats file sizes correctly", () => {
    expect(formatFileSize(500)).toBe("500 B");
    expect(formatFileSize(1024)).toBe("1.0 KB");
    expect(formatFileSize(2048)).toBe("2.0 KB");
    expect(formatFileSize(1024 * 1024)).toBe("1.0 MB");
  });

  it("identifies image files correctly", () => {
    expect(isImageFile("screenshot.png")).toBe(true);
    expect(isImageFile("photo.jpg")).toBe(true);
    expect(isImageFile("vector.svg")).toBe(true);
    expect(isImageFile("code.ts")).toBe(false);
    expect(isImageFile("blob", "image/webp")).toBe(true);
  });

  it("identifies text files correctly", () => {
    expect(isTextFile("main.rs")).toBe(true);
    expect(isTextFile("App.tsx")).toBe(true);
    expect(isTextFile("doc.md")).toBe(true);
    expect(isTextFile("data.json")).toBe(true);
    expect(isTextFile("binary.wasm")).toBe(false);
  });

  it("formats prompt with code and image attachments", () => {
    const attachments: PromptAttachment[] = [
      {
        id: "att-1",
        name: "math.rs",
        size: 100,
        type: "text/x-rust",
        textContent: "pub fn add(a: i32, b: i32) -> i32 { a + b }",
        isImage: false,
      },
      {
        id: "att-2",
        name: "ui.png",
        size: 4096,
        type: "image/png",
        dataUrl: "data:image/png;base64,iVBORw0KGgo...",
        isImage: true,
      },
    ];

    const formatted = formatPromptWithAttachments("Review this math function and UI", attachments);
    expect(formatted).toContain("Review this math function and UI");
    expect(formatted).toContain("--- Attached Files (2) ---");
    expect(formatted).toContain("[File: math.rs (100 B)]");
    expect(formatted).toContain("pub fn add(a: i32, b: i32) -> i32 { a + b }");
    expect(formatted).toContain("[Image: ui.png (4.0 KB)]");
    expect(formatted).toContain("![ui.png](data:image/png;base64,iVBORw0KGgo...)");
  });

  it("extracts attachments from ThreadEvent data", () => {
    const sampleAtts: PromptAttachment[] = [
      { id: "1", name: "test.ts", size: 50, type: "text/typescript", isImage: false },
    ];
    const event: ThreadEvent = {
      id: "evt-1",
      card_id: "c-1",
      kind: "user",
      author: "you",
      text: "hello",
      data: { attachments: sampleAtts },
      created_at: new Date().toISOString(),
    };

    const extracted = extractAttachmentsFromEvent(event);
    expect(extracted).toEqual(sampleAtts);
  });

  it("extracts markdown dataUrl image attachments from raw text if data.attachments is absent", () => {
    const event: ThreadEvent = {
      id: "evt-2",
      card_id: "c-1",
      kind: "user",
      author: "you",
      text: "Check this screenshot: ![preview.png](data:image/png;base64,AAAA)",
      created_at: new Date().toISOString(),
    };

    const extracted = extractAttachmentsFromEvent(event);
    expect(extracted.length).toBe(1);
    expect(extracted[0].name).toBe("preview.png");
    expect(extracted[0].isImage).toBe(true);
    expect(extracted[0].dataUrl).toBe("data:image/png;base64,AAAA");
  });
});
