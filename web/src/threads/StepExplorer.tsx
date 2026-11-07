import { useMemo, useState } from "react";
import { Icon } from "../components/Icon";
import { openInEditor } from "../lib/api";
import { splitThought } from "../lib/threads";
import type { ThreadEvent } from "../lib/types";

export interface StepItem {
  id: string;
  kind: "search" | "find" | "analyze" | "command" | "inspect" | "edit" | "gate" | "thought" | "generic";
  query?: string;
  scope?: string;
  file?: string;
  ext?: string;
  lineRange?: string;
  lineStart?: number;
  command?: string;
  title?: string;
  body?: string;
  text: string;
  detail?: string;
  output?: string;
  status?: "running" | "success" | "failed" | string;
  createdAt?: string;
}

interface StepExplorerProps {
  running?: boolean;
  events?: ThreadEvent[];
  intent?: string;
  activeTurnId?: string | null;
  onOpenFile?: (path: string, line?: number) => void;
  /** When false, render step content without an outer disclosure wrapper (for embedding in another Details section). */
  disclosure?: boolean;
  className?: string;
}

function firstString(...vals: unknown[]): string | undefined {
  for (const v of vals) if (typeof v === "string" && v.trim()) return v.trim();
  return undefined;
}

export function parseStepEvent(event: ThreadEvent): StepItem {
  const data = (event.data || {}) as Record<string, unknown>;
  const rawText = event.text || "";
  const name = String(data.name || event.kind || "").toLowerCase();
  const input = (data.input && typeof data.input === "object" ? data.input : {}) as Record<string, unknown>;
  const output = firstString(data.output, data.stdout, data.result, input.output);
  const status = firstString(data.status, input.status);
  const detail = firstString(data.detail, input.detail, data.error);
  const createdAt = event.created_at;

  const thoughtText = firstString(data.thought, data.reasoning, data.thinking);
  if (thoughtText || name === "thought" || name === "reasoning" || name === "thinking" || event.kind === "thought" || event.kind === "reasoning") {
    const t = splitThought(thoughtText || rawText);
    return { id: event.id, kind: "thought", title: t.title, body: t.body, text: `${t.title} ${t.preview}`.trim(), detail: t.body, status, createdAt };
  }

  const filePath = firstString(input.path, input.file, input.filePath, input.file_path, typeof data.path === "string" ? data.path : undefined);
  const lineStartRaw = input.line_start ?? input.start_line ?? input.line ?? input.lineStart;
  const lineEndRaw = input.line_end ?? input.end_line ?? input.endLine;
  const lineStart = typeof lineStartRaw === "number" ? lineStartRaw : typeof lineStartRaw === "string" ? Number(lineStartRaw) : undefined;
  const lineEnd = typeof lineEndRaw === "number" ? lineEndRaw : typeof lineEndRaw === "string" ? Number(lineEndRaw) : undefined;
  const lineRange = lineStart && lineEnd ? `#L${lineStart}-${lineEnd}` : lineStart ? `#L${lineStart}` : "";

  if (filePath || name.includes("read") || name.includes("inspect_file") || /^analyz(ed|ing)/i.test(rawText)) {
    const analyzedTarget = rawText.replace(/^analyz(ed|ing)\s+/i, "").trim();
    const tokens = analyzedTarget.split(/\s+/).filter(Boolean);
    // Legacy: "Analyzed ts api.ts #L1550-1600" (badge token before file) => expose badge token as file for compatibility.
    const legacyBadgeThenFile = !filePath && tokens.length >= 2 && /^[a-z]{1,4}$/i.test(tokens[0]) && /[./#]/.test(tokens[1]);
    const cleanPath = filePath || (legacyBadgeThenFile ? tokens[0] : tokens.find((t) => t.includes(".") || t.includes("/")) || tokens[0] || "file");
    const displayFile = filePath || (legacyBadgeThenFile ? tokens[1] : cleanPath);
    const ext = displayFile.split(".").pop()?.toLowerCase().replace(/[^a-z0-9].*$/i, "") || "";
    return {
      id: event.id,
      kind: "analyze",
      file: cleanPath,
      ext,
      lineRange: lineRange || (rawText.match(/#L\d+(?:-\d+)?/)?.[0] ?? ""),
      lineStart: lineStart && Number.isFinite(lineStart) ? lineStart : undefined,
      text: rawText || `Analyzed ${displayFile}${lineRange ? ` ${lineRange}` : ""}`,
      detail: detail || displayFile,
      output,
      status,
    };
  }

  if (name.includes("edit") || name.includes("write") || name.includes("patch")) {
    const target = filePath || firstString(input.target, input.file) || "file";
    return { id: event.id, kind: "edit", file: target, ext: target.split(".").pop()?.toLowerCase(), text: rawText || `Edited ${target}`, detail, output, status };
  }

  if (name.includes("search") || name.includes("grep") || /^ran search/i.test(rawText)) {
    const query = firstString(input.query, input.pattern, input.regex) || rawText.replace(/^ran search\s+/i, "").split(" in ")[0] || "query";
    const scope = firstString(input.scope, input.path, input.target) || (rawText.includes(" in ") ? rawText.split(" in ")[1]?.replace(/[›\s]+$/g, "").trim() : "codebase");
    return { id: event.id, kind: "search", query, scope, text: rawText || `Searched ${query} in ${scope}`, detail, output, status };
  }

  if (name.includes("find") || /^ran find/i.test(rawText)) {
    const query = firstString(input.symbol, input.name, input.query) || rawText.replace(/^ran find\s+/i, "").split(" in ")[0] || "symbol";
    const scope = firstString(input.scope, input.target) || (rawText.includes(" in ") ? rawText.split(" in ")[1]?.replace(/[›\s]+$/g, "").trim() : undefined);
    return { id: event.id, kind: "find", query, scope, text: rawText || `Found ${query}`, detail, output, status };
  }

  if (name.includes("inspect") || /^ran inspect/i.test(rawText)) {
    const query = firstString(input.target, input.symbol) || rawText.replace(/^ran inspect\s+/i, "").replace(/[›\s]+$/g, "").trim() || "symbol";
    return { id: event.id, kind: "inspect", query, text: rawText || `Inspected ${query}`, detail, output, status };
  }

  if (event.kind === "gate" || name.includes("gate") || name.includes("test")) {
    const command = firstString(input.command, input.cmd) || "check";
    return { id: event.id, kind: "gate", command, text: rawText || `Ran checks (${command})`, detail, output, status };
  }

  if (name.includes("command") || name.includes("bash") || name.includes("shell") || name.includes("terminal") || /^ran\b/i.test(rawText)) {
    const command = firstString(input.command, input.cmd) || rawText.replace(/^ran\s+/i, "").replace(/[›\s]+$/g, "").trim() || "command";
    return { id: event.id, kind: "command", command, text: rawText || `Ran ${command}`, detail, output, status };
  }

  return { id: event.id, kind: "generic", text: rawText || name || "Step", detail, output, status };
}

function stepSummary(step: StepItem): { icon: string; label: string; value?: string; meta?: string } {
  switch (step.kind) {
    case "thought": return { icon: "spark", label: step.title || "Thought", value: step.body ? step.body.replace(/\s+/g, " ").slice(0, 90) : undefined };
    case "analyze": return { icon: "doc", label: "Read", value: step.file ? `${step.file}${step.lineRange ? ` ${step.lineRange}` : ""}` : step.text };
    case "edit": return { icon: "doc", label: "Edited", value: step.file || step.text };
    case "search": return { icon: "search", label: "Search", value: step.query, meta: step.scope ? `in ${step.scope}` : undefined };
    case "find": return { icon: "search", label: "Find", value: step.query, meta: step.scope ? `in ${step.scope}` : undefined };
    case "inspect": return { icon: "eye", label: "Inspect", value: step.query || step.text };
    case "gate": return { icon: "check", label: "Checks", value: step.command };
    case "command": return { icon: "terminal", label: "Run", value: step.command || step.text };
    default: return { icon: "spark", label: "Step", value: step.text };
  }
}

function statusTone(status?: string) {
  if (status === "failed" || status === "error") return "text-danger";
  if (status === "running" || status === "in_progress") return "text-accent-text";
  if (status === "success" || status === "completed" || status === "passed") return "text-success";
  return "text-muted";
}

export function StepExplorer({ running = false, events = [], onOpenFile, disclosure = true, className = "" }: StepExplorerProps) {
  const [open, setOpen] = useState(false);
  const steps = useMemo(
    () => events.filter((e) => e.kind === "tool_call" || e.kind === "file_change" || e.kind === "gate").map(parseStepEvent),
    [events]
  );

  if (steps.length === 0) {
    if (!running) return null;
    return (
      <div className={`text-[11px] text-muted ${disclosure ? "my-1" : ""} ${className}`.trim()} aria-live="polite">
        Working…
      </div>
    );
  }

  const list = (
    <div className={`${disclosure ? "mt-0.5" : ""} space-y-px`.trim()}>
      {steps.map((step) => {
        const s = stepSummary(step);
        const runningStep = step.status === "running" || step.status === "in_progress";
        const failedStep = step.status === "failed" || step.status === "error";
        const expandable = Boolean(step.detail || step.output || step.command || step.file || step.body);
        const collapsedLabel =
          step.kind === "thought" ? `${s.label}${s.value ? `  ${s.value}` : ""}` : (s.value || step.text);
        const tone = failedStep ? "text-danger" : runningStep ? "text-text" : "text-muted-strong";
        const iconTone = failedStep ? "text-danger" : runningStep ? "text-accent-text" : "text-muted";
        const row = (
          <>
            <span className={`shrink-0 ${iconTone}`}>
              <Icon name={failedStep ? "x" : ((s.icon as any) || "spark")} size={12} />
            </span>
            <span className={`min-w-0 flex-1 truncate text-[12px] ${tone}`} title={collapsedLabel}>
              {collapsedLabel}
            </span>
            {runningStep ? (
              <span className="shrink-0 rounded bg-accent-soft px-1 py-0.5 text-[9.5px] font-medium text-accent-text">
                running
              </span>
            ) : null}
            {failedStep ? (
              <span className="shrink-0 rounded bg-danger-soft px-1 py-0.5 text-[9.5px] font-medium text-danger">
                failed
              </span>
            ) : null}
            {s.meta ? <span className="shrink-0 text-[10.5px] text-muted">{s.meta}</span> : null}
          </>
        );
        if (!expandable) {
          return (
            <div key={step.id} className="flex items-center gap-2 rounded px-1 py-[5px]">
              {row}
            </div>
          );
        }
        return (
          <details key={step.id} className="group/step rounded hover:bg-white/[0.015]">
            <summary
              className="flex cursor-pointer list-none items-center gap-2 px-1 py-[5px] [&::-webkit-details-marker]:hidden"
              onClick={(e) => {
                if (step.file && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  if (onOpenFile) onOpenFile(step.file, step.lineStart);
                  else void openInEditor(step.file, step.lineStart);
                }
              }}
            >
              {row}
              <span
                className="shrink-0 text-[10px] text-muted/50 transition-transform group-open/step:rotate-90"
                aria-hidden="true"
              >
                ▸
              </span>
            </summary>
            <div className="ml-5 border-l border-border/40 px-2.5 pb-1.5 pt-0.5 text-[11px]">
              {step.kind === "thought" && step.title ? (
                <div className="text-[13px] font-semibold text-text">{step.title}</div>
              ) : null}
              {step.kind === "thought" && (step.body || step.detail) ? (
                <div className="mt-1 whitespace-pre-wrap leading-relaxed text-muted-strong">{step.body || step.detail}</div>
              ) : null}
              {step.command && step.kind !== "thought" ? (
                <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-[11px] text-muted-strong">
                  {step.command}
                </pre>
              ) : null}
              {step.file ? (
                <button
                  type="button"
                  className="block font-mono text-[11px] text-accent-text/80 hover:text-accent-text"
                  onClick={() => (onOpenFile ? onOpenFile(step.file!, step.lineStart) : void openInEditor(step.file!, step.lineStart))}
                >
                  {step.file}
                  {step.lineRange ? ` ${step.lineRange}` : ""}
                </button>
              ) : null}
              {step.kind !== "thought" && step.detail ? <div className="whitespace-pre-wrap text-muted">{step.detail}</div> : null}
              {step.output ? (
                <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded border border-border/40 bg-bg/40 p-1.5 font-mono text-[10px] text-muted-strong">
                  {step.output.length > 4000 ? `${step.output.slice(0, 4000)}\n…` : step.output}
                </pre>
              ) : null}
              {step.createdAt ? (
                <div className="mt-1 text-[10px] text-muted/60">
                  {new Date(step.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                </div>
              ) : null}
            </div>
          </details>
        );
      })}
    </div>
  );

  if (!disclosure) {
    return <section className={className} aria-label={running ? "Working steps" : "Steps"}>{list}</section>;
  }

  return (
    <details
      className={`thread-details group my-1.5 ${className}`.trim()}
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-md px-1 py-0.5 text-[11px] text-muted hover:text-muted-strong [&::-webkit-details-marker]:hidden">
        <Icon name="chevR" size={11} className={`transition-transform ${open ? "rotate-90" : ""}`} />
        <span>
          {running ? "Working" : "Steps"} · {steps.length}
        </span>
      </summary>
      {list}
    </details>
  );
}
