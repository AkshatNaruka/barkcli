import React, { useEffect, useMemo, useRef, useState } from "react";
import type { ExecResult, ProjectSnapshot, RunCommand } from "../lib/types";
import { fetchProject, runProjectCommand } from "../lib/api";
import { isDesktop, openTerminal } from "../lib/desktop";
import { Icon } from "./Icon";

interface CommandRunnerProps {
  open: boolean;
  onClose: () => void;
}

function defaultCommands(project: ProjectSnapshot | null): RunCommand[] {
  const discovered = project?.commands || [];
  if (discovered.length > 0) return discovered;
  return [
    { id: "pwd", label: "Show project root", command: "pwd" },
    { id: "ls", label: "List files", command: "ls -la" },
  ];
}

export function CommandRunner({ open, onClose }: CommandRunnerProps) {
  const [project, setProject] = useState<ProjectSnapshot | null>(null);
  const [command, setCommand] = useState("");
  const [result, setResult] = useState<ExecResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setResult(null);
    fetchProject().then((next) => {
      setProject(next);
      if (!next) {
        setError("The command runner needs the local Bark server.");
        return;
      }
      const first = defaultCommands(next)[0];
      setCommand((current) => current || first?.command || "pwd");
    });
    window.setTimeout(() => inputRef.current?.focus(), 30);
  }, [open]);

  const commands = useMemo(() => defaultCommands(project), [project]);

  if (!open) return null;

  const run = async () => {
    const next = command.trim();
    if (!next || running) return;
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const output = await runProjectCommand(next);
      if (!output) {
        setError("The command could not be started. Check the local server.");
        return;
      }
      setResult(output);
    } finally {
      setRunning(false);
    }
  };

  const copyOutput = async () => {
    if (!result) return;
    const text = [result.stdout, result.stderr].filter(Boolean).join("\n");
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* clipboard is optional */
    }
  };

  const terminal = async () => {
    const opened = isDesktop() && (await openTerminal(project?.root));
    if (!opened && project?.root) {
      try {
        await navigator.clipboard.writeText(`cd ${JSON.stringify(project.root)}`);
      } catch {
        /* clipboard is optional */
      }
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/65 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label="Command runner"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="flex h-[min(680px,84vh)] w-full max-w-[920px] overflow-hidden rounded-[14px] border border-border bg-bg shadow-2xl">
        <div className="flex w-[250px] shrink-0 flex-col border-r border-border/80">
          <div className="flex h-12 items-center gap-2 border-b border-border/70 px-3">
            <Icon name="code" size={14} className="text-accent-text" />
            <span className="text-[12px] font-medium text-text">Commands</span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
            {commands.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setCommand(item.command);
                  inputRef.current?.focus();
                }}
                className={`w-full rounded-md px-2.5 py-2 text-left transition-colors ${
                  command === item.command
                    ? "bg-accent-soft text-text"
                    : "text-muted-strong hover:bg-white/[0.04] hover:text-text"
                }`}
              >
                <div className="text-[11.5px] font-medium">{item.label}</div>
                <div className="mt-0.5 truncate font-mono text-[9.5px] text-muted/65">
                  {item.command}
                </div>
              </button>
            ))}
          </div>
          <div className="border-t border-border/70 px-3 py-2.5">
            <button
              type="button"
              onClick={terminal}
              className="flex w-full items-center gap-2 rounded-md border border-border px-2 py-1.5 text-[10.5px] text-muted-strong transition-colors hover:border-border-strong hover:text-text"
            >
              <Icon name="terminal" size={12} />
              Open system terminal
            </button>
            {project?.root && (
              <p className="mt-2 truncate font-mono text-[9px] text-muted/55" title={project.root}>
                {project.root}
              </p>
            )}
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border/70 px-3">
            <span className="font-mono text-[11px] text-accent-text">$</span>
            <input
              ref={inputRef}
              value={command}
              onChange={(event) => setCommand(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") onClose();
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  void run();
                }
              }}
              aria-label="Project command"
              className="min-w-0 flex-1 bg-transparent font-mono text-[12px] text-text placeholder:text-muted/55 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => void run()}
              disabled={!command.trim() || running || !project}
              className="flex h-7 items-center gap-1.5 rounded-md bg-accent px-2.5 text-[10.5px] font-medium text-bg transition-opacity hover:opacity-90 disabled:opacity-35"
            >
              {running ? "Running…" : "Run"}
              <kbd className="text-[9px] opacity-70">⌘↵</kbd>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close command runner"
              className="flex h-7 w-7 items-center justify-center rounded text-muted hover:bg-white/[0.05] hover:text-text"
            >
              <Icon name="x" size={12} />
            </button>
          </div>

          <div className="flex items-center gap-3 border-b border-border/60 px-3 py-1.5 font-mono text-[9px] text-muted/65">
            <span>
              {running
                ? "waiting for command…"
                : result
                  ? result.timed_out
                    ? "timed out"
                    : result.ok
                      ? "exit 0"
                      : `exit ${result.exit_code ?? "?"}`
                  : "ready"}
            </span>
            {result && <span>{result.duration_ms} ms</span>}
            <span className="ml-auto">commands run in the project root</span>
          </div>

          <div className="min-h-0 flex-1 overflow-auto bg-[var(--bg)] p-3">
            {error ? (
              <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-[11px] text-danger">
                {error}
              </div>
            ) : result ? (
              <div className="space-y-3 font-mono text-[10.5px] leading-[1.7]">
                {result.stdout && (
                  <pre className="whitespace-pre-wrap break-words text-muted-strong">
                    {result.stdout}
                  </pre>
                )}
                {result.stderr && (
                  <pre className="whitespace-pre-wrap break-words border-l-2 border-danger/50 pl-2 text-danger/85">
                    {result.stderr}
                  </pre>
                )}
                {!result.stdout && !result.stderr && (
                  <p className="text-muted">The command produced no output.</p>
                )}
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-center">
                <div>
                  <Icon name="terminal" size={18} className="mx-auto text-muted/45" />
                  <p className="mt-2 text-[11.5px] text-muted">
                    Run a test, build, or Git command without leaving Bark.
                  </p>
                  <p className="mt-1 font-mono text-[9.5px] text-muted/55">
                    ⌘↵ run · esc close
                  </p>
                </div>
              </div>
            )}
          </div>

          {result && (
            <div className="flex h-9 shrink-0 items-center justify-end gap-2 border-t border-border/70 px-3">
              <button
                type="button"
                onClick={() => void copyOutput()}
                className="rounded px-2 py-1 text-[10px] text-muted transition-colors hover:bg-white/[0.05] hover:text-text"
              >
                Copy output
              </button>
              <button
                type="button"
                onClick={() => void run()}
                disabled={running}
                className="rounded px-2 py-1 text-[10px] text-muted transition-colors hover:bg-white/[0.05] hover:text-text disabled:opacity-40"
              >
                Run again
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
