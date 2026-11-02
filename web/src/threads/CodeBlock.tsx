import React, { useState } from "react";
import { Icon } from "../components/Icon";

interface CodeBlockProps {
  children?: React.ReactNode;
  className?: string;
  [key: string]: any;
}

function extractText(node: React.ReactNode): string {
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (!node) return "";
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (React.isValidElement(node) && node.props && node.props.children) {
    return extractText(node.props.children);
  }
  return "";
}

export function CodeBlock({ children, className, ...props }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  // Extract language from code child if present
  let language = "";
  if (React.isValidElement(children) && children.props && children.props.className) {
    const match = /language-(\w+)/.exec(children.props.className);
    if (match) language = match[1];
  }

  const handleCopy = () => {
    const text = extractText(children);
    if (!text) return;
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      // Fallback
    });
  };

  const displayLang = language ? language.toUpperCase() : "CODE";

  return (
    <div className="chat-codeblock-wrap group/code my-3 overflow-hidden rounded-lg border border-border/70 bg-surface/80 dark:bg-card/70 shadow-xs">
      <div className="chat-codeblock-header flex items-center justify-between border-b border-border/50 bg-surface/50 px-3 py-1.5 text-[11px] font-mono text-muted select-none">
        <span className="flex items-center gap-1.5 font-semibold tracking-wider text-muted-strong">
          <Icon name="code" size={12} className="text-accent" />
          {displayLang}
        </span>
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
      <pre className="chat-codeblock-pre m-0 p-3.5 overflow-x-auto text-[12.5px] font-mono leading-relaxed bg-transparent border-0" {...props}>
        {children}
      </pre>
    </div>
  );
}
