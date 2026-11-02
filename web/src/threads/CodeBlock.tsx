import React, { useState } from "react";
import { Icon } from "../components/Icon";

export interface CodeBlockProps {
  children?: React.ReactNode;
  className?: string;
  onRun?: (code: string) => void;
  [key: string]: any;
}

export function extractText(node: React.ReactNode): string {
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (React.isValidElement(node) && node.props && "children" in node.props) {
    return extractText(node.props.children);
  }
  return "";
}

function findCodeChild(node: React.ReactNode): React.ReactElement<any> | null {
  if (React.isValidElement(node)) {
    if (node.type === "code" || (node.props && node.props.className)) return node;
    if (node.props && "children" in node.props) return findCodeChild(node.props.children);
  }
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findCodeChild(item);
      if (found) return found;
    }
  }
  return null;
}

const LANG_MAP: Record<string, string> = {
  ts: "TYPESCRIPT",
  tsx: "TSX",
  js: "JAVASCRIPT",
  jsx: "JSX",
  py: "PYTHON",
  rs: "RUST",
  sh: "BASH",
  bash: "BASH",
  zsh: "BASH",
  shell: "BASH",
  json: "JSON",
  yaml: "YAML",
  yml: "YAML",
  md: "MARKDOWN",
  markdown: "MARKDOWN",
  html: "HTML",
  css: "CSS",
  sql: "SQL",
  cpp: "C++",
  "c++": "C++",
  cs: "C#",
  "c#": "C#",
  rb: "RUBY",
  go: "GO",
};

async function copyTextToClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fallback to execCommand below
    }
  }
  try {
    const el = document.createElement("textarea");
    el.value = text;
    el.setAttribute("readonly", "");
    el.style.contain = "strict";
    el.style.position = "absolute";
    el.style.left = "-9999px";
    el.style.fontSize = "12pt";
    document.body.appendChild(el);
    el.select();
    const success = document.execCommand("copy");
    document.body.removeChild(el);
    return success;
  } catch {
    return false;
  }
}

export function CodeBlock({ children, className, onRun, ...props }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const [wrapped, setWrapped] = useState(false);
  const [staged, setStaged] = useState(false);

  // Extract language from code child whether single or nested array
  const codeChild = findCodeChild(children);
  let language = "";
  if (codeChild?.props?.className) {
    const match = /(?:language|lang)-([a-zA-Z0-9_#+-]+)/.exec(codeChild.props.className);
    if (match) language = match[1].toLowerCase();
  }

  const rawText = extractText(children);
  const trimmed = rawText.trim();
  const isShell = /^(?:sh|bash|zsh|shell|fish|powershell|pwsh|cmd)$/i.test(language);

  const handleCopy = async () => {
    if (!rawText) return;
    const ok = await copyTextToClipboard(rawText);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleRun = () => {
    if (!trimmed || !onRun) return;
    onRun(trimmed);
    setStaged(true);
    window.setTimeout(() => setStaged(false), 2000);
  };

  const displayLang = language ? LANG_MAP[language] || language.toUpperCase() : "CODE";

  return (
    <div
      className="chat-codeblock-wrap group/code my-3 overflow-hidden rounded-lg border border-border/70 bg-surface/80 dark:bg-card/70 shadow-xs"
      data-language={language || "code"}
      data-wrap={wrapped ? "true" : "false"}
    >
      <div className="chat-codeblock-header flex items-center justify-between border-b border-border/50 bg-surface/50 px-3 py-1.5 text-[11px] font-mono text-muted select-none">
        <span className="flex items-center gap-1.5 font-semibold tracking-wider text-muted-strong">
          <Icon name="code" size={12} className="text-accent" />
          {displayLang}
        </span>
        <div className="flex items-center gap-1">
          {isShell && onRun && (
            <button
              type="button"
              onClick={handleRun}
              className={`flex items-center gap-1 rounded px-2 py-0.5 text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent ${
                staged
                  ? "text-success bg-success/10 font-medium"
                  : "text-muted hover:bg-surface-elevated hover:text-text"
              }`}
              aria-label={staged ? "Staged in composer" : "Run command in composer"}
              title="Run or stage command in composer"
            >
              <Icon name={staged ? "check" : "play"} size={11} className={staged ? "text-success" : ""} />
              <span>{staged ? "Staged" : "Run"}</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setWrapped((val) => !val)}
            className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent ${
              wrapped
                ? "text-accent bg-accent/10"
                : "text-muted hover:bg-surface-elevated hover:text-text"
            }`}
            aria-label={wrapped ? "Disable line wrap" : "Wrap lines"}
            aria-pressed={wrapped}
            title={wrapped ? "Disable line wrap" : "Wrap lines"}
          >
            <Icon name="wrap" size={12} />
          </button>
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1 rounded px-2 py-0.5 text-[11px] text-muted hover:bg-surface-elevated hover:text-text transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
            aria-label={copied ? "Copied code" : "Copy code"}
            title="Copy to clipboard"
          >
            <Icon name={copied ? "check" : "copy"} size={12} className={copied ? "text-success" : ""} />
            <span>{copied ? "Copied" : "Copy"}</span>
          </button>
        </div>
      </div>
      <pre
        className={`chat-codeblock-pre m-0 p-3.5 text-[12.5px] font-mono leading-relaxed bg-transparent border-0 ${
          wrapped ? "whitespace-pre-wrap break-words" : "whitespace-pre overflow-x-auto"
        }`}
        {...props}
      >
        {children}
      </pre>
    </div>
  );
}
