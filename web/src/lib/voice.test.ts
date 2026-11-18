import { describe, expect, it, vi } from "vitest";
import {
  cleanMarkdownForTTS,
  isSpeechRecognitionSupported,
  isSpeechSynthesisSupported,
} from "./voice";

describe("voice library", () => {
  it("cleans dense markdown, reasoning, and code blocks for TTS readout", () => {
    const raw = `<think>Need to generate component</think>
# Header 1
Here is **bold** and *italic* and [a link](https://example.com).

\`\`\`tsx
export function MyComponent() {
  return <div>Code</div>;
}
\`\`\`

- Bullet item 1
- Bullet item 2

Check this \`inline code\` now!`;

    const cleaned = cleanMarkdownForTTS(raw);
    expect(cleaned).not.toContain("<think>");
    expect(cleaned).not.toContain("Need to generate component");
    expect(cleaned).not.toContain("```");
    expect(cleaned).not.toContain("return <div>Code</div>;");
    expect(cleaned).toContain("[code snippet]");
    expect(cleaned).toContain("Here is bold and italic and a link.");
    expect(cleaned).toContain("Bullet item 1");
    expect(cleaned).toContain("Check this inline code now!");
  });

  it("handles empty or blank text gracefully", () => {
    expect(cleanMarkdownForTTS("")).toBe("");
    expect(cleanMarkdownForTTS("   \n\n  ")).toBe("");
  });

  it("detects SpeechSynthesis and SpeechRecognition support", () => {
    // In jsdom environment, window exists
    expect(typeof isSpeechRecognitionSupported()).toBe("boolean");
    expect(typeof isSpeechSynthesisSupported()).toBe("boolean");
  });
});
