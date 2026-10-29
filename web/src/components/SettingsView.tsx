import React, { useEffect, useState } from "react";
import type { Board as BoardType, ProviderStatus } from "../lib/types";
import { apiAccess, fetchConfig, fetchHooks, fetchProject, fetchProviders, validateBoards, type BoardConfig } from "../lib/api";
import { isDesktop, openLogs, openProviderLogin, openTerminal } from "../lib/desktop";
import { useTheme, type Theme } from "../lib/theme";
import { Icon } from "./Icon";

export function SettingsView({
  board,
  onSaveBoard,
}: {
  board: BoardType;
  onSaveBoard: (b: BoardType) => void;
}) {
  const [title, setTitle] = useState(board.title);
  const [description, setDescription] = useState(board.description || "");
  const [cols, setCols] = useState(board.columns.map((c) => ({ id: c.id, name: c.name })));
  const [ai, setAi] = useState<BoardConfig["ai"] | null>(null);
  const { theme, setTheme } = useTheme();
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [diagnostics, setDiagnostics] = useState<any | null>(null);
  const [diagnosticsBusy, setDiagnosticsBusy] = useState(false);
  const [authBusy, setAuthBusy] = useState<string | null>(null);
  const [authNote, setAuthNote] = useState<string | null>(null);

  useEffect(() => { setTitle(board.title); setDescription(board.description || ""); setCols(board.columns.map((c) => ({ id: c.id, name: c.name }))); }, [board.title, board.description, board.columns]);
  useEffect(() => {
    fetchConfig().then((c) => setAi(c?.ai ?? null));
    fetchProviders().then((next) =>
      setProviders(next.filter((provider) => provider.id !== "human"))
    );
  }, []);

  const authenticate = async (provider: ProviderStatus) => {
    setAuthNote(null);
    if (isDesktop()) {
      setAuthBusy(provider.id);
      const opened = await openProviderLogin(provider.id);
      setAuthBusy(null);
      setAuthNote(
        opened
          ? `${provider.name} sign-in opened in Terminal. Finish there, then reload this page.`
          : `Could not open a terminal for ${provider.name}.`
      );
      return;
    }
    if (!provider.auth_command) {
      setAuthNote(`${provider.name} does not expose a local sign-in command.`);
      return;
    }
    try {
      await navigator.clipboard.writeText(provider.auth_command);
      setAuthNote(`Copied \`${provider.auth_command}\`. Run it, then reload this page.`);
    } catch {
      setAuthNote(`Run \`${provider.auth_command}\`, then reload this page.`);
    }
  };

  const notify = (msg: string) => {
    setSavedMsg(msg);
    setTimeout(() => setSavedMsg(null), 2500);
  };

  const save = (next: BoardType) => {
    onSaveBoard(next);
    notify("Saved");
  };

  const onSaveTitle = () => {
    const b = { ...board, title: title.trim() || board.title, description: description.trim() || undefined };
    save(b);
  };

  const onRenameColumn = (id: string, name: string) => {
    const nextCols = cols.map((c) => (c.id === id ? { ...c, name } : c));
    setCols(nextCols);
    const b = { ...board, columns: nextCols };
    save(b);
  };

  const onAddColumn = () => {
    const base = "new-column";
    let id = base;
    let i = 2;
    while (cols.some((c) => c.id === id)) { id = `${base}-${i}`; i++; }
    const nextCols = [...cols, { id, name: id }];
    setCols(nextCols);
    save({ ...board, columns: nextCols });
  };

  const onRemoveColumn = (id: string) => {
    if (cols.length <= 1) return;
    const nextCols = cols.filter((c) => c.id !== id);
    setCols(nextCols);
    const first = nextCols[0].id;
    const b = {
      ...board,
      columns: nextCols,
      cards: board.cards.map((c) => (c.column === id ? { ...c, column: first } : c)),
    };
    save(b);
  };

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="bg-surface border border-border rounded-lg p-4">
      <h3 className="text-xs font-semibold text-text mb-3">{title}</h3>
      {children}
    </div>
  );

  const runDiagnostics = async () => {
    setDiagnosticsBusy(true);
    try {
      const [project, hooks, validation, providerList] = await Promise.all([
        fetchProject(),
        fetchHooks(),
        validateBoards().catch(() => null),
        fetchProviders().catch(() => []),
      ]);
      const ping = await fetch("/api/ping").then((r) => r.json()).catch(() => null);
      setDiagnostics({
        project,
        hooks,
        validation,
        providers: providerList,
        ping,
        collected_at: new Date().toISOString(),
      });
    } finally {
      setDiagnosticsBusy(false);
    }
  };

  const copyDiagnostics = async () => {
    if (!diagnostics) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(diagnostics, null, 2));
    } catch {
      /* clipboard is optional */
    }
  };

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-2xl mx-auto p-4 space-y-6">
        {savedMsg && (
          <div className="text-[11px] text-success bg-success-soft rounded px-3 py-2">
            {savedMsg}
          </div>
        )}

        {/* Board identity */}
        <Section title="Board">
          <div className="space-y-3">
            <label className="block">
              <span className="text-[10px] uppercase tracking-wider text-muted block mb-1">Title</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={onSaveTitle}
                className="w-full bg-bg border border-border rounded px-2.5 py-1.5 text-sm text-text focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </label>
            <label className="block">
              <span className="text-[10px] uppercase tracking-wider text-muted block mb-1">Description</span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onBlur={onSaveTitle}
                rows={2}
                className="w-full bg-bg border border-border rounded px-2.5 py-1.5 text-sm text-text focus:outline-none focus:ring-1 focus:ring-accent resize-none"
              />
            </label>
          </div>
        </Section>

        {/* Columns */}
        <Section title="Columns">
          <div className="space-y-2">
            {cols.map((c) => (
              <div key={c.id} className="flex items-center gap-2">
                <span className="font-mono text-[10px] text-muted w-20 truncate shrink-0">{c.id}</span>
                <input
                  value={c.name}
                  onChange={(e) => onRenameColumn(c.id, e.target.value)}
                  className="flex-1 bg-bg border border-border rounded px-2.5 py-1.5 text-sm text-text focus:outline-none focus:ring-1 focus:ring-accent"
                />
                <button
                  onClick={() => onRemoveColumn(c.id)}
                  disabled={cols.length <= 1}
                  className="text-muted hover:text-danger transition-colors disabled:opacity-30"
                  title="Remove column (cards move to the first column)"
                >
                  <Icon name="x" size={13} />
                </button>
              </div>
            ))}
            <button
              onClick={onAddColumn}
              className="text-[11px] px-2 py-1 rounded text-muted hover:text-accent hover:bg-accent-soft transition-colors"
            >
              + Add column
            </button>
          </div>
        </Section>

        {/* Theme */}
        <Section title="Theme">
          <div className="flex flex-wrap bg-surface rounded-md p-0.5 w-fit border border-border">
            {(["black", "slate", "neon", "light", "system"] as Theme[]).map((t) => {
              const label =
                t === "black" ? "Bark" : t === "slate" ? "Slate" : t === "neon" ? "Terminal" : t === "light" ? "Paper" : "Auto";
              return (
                <button
                  key={t}
                  onClick={() => setTheme(t)}
                  className={`px-3 py-1 text-xs rounded font-medium transition-colors ${
                    theme === t ? "bg-accent text-white" : "text-muted hover:text-text"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-[10.5px] text-muted/70">
            Accent, rail labels, surface order and share links live in Appearance (⌘,).
          </p>
        </Section>

        {/* Local coding agents */}
        <Section title="Local agents">
          <p className="mb-3 text-[11px] text-muted">
            Bark runs the coding CLIs installed on this machine. It never invents a
            provider or reports one as ready when it is not.
          </p>
          <div className="space-y-1.5">
            {providers.length === 0 ? (
              <p className="text-xs text-muted">No local agents reported by the server.</p>
            ) : (
              providers.map((provider) => (
                <div key={provider.id} className="flex items-center gap-2 rounded border border-border/60 px-2.5 py-2">
                  <Icon name="robot" size={13} className="text-muted" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[11.5px] text-text">{provider.name}</div>
                    <div className="truncate font-mono text-[9.5px] text-muted">
                      {provider.command}
                      {provider.version ? ` · ${provider.version}` : ""}
                    </div>
                  </div>
                  <span
                    className={`font-mono text-[9.5px] ${
                      !provider.available
                        ? "text-muted"
                        : provider.authenticated === false
                          ? "text-amber-400"
                          : provider.authenticated === true
                            ? "text-emerald-400"
                            : "text-muted"
                    }`}
                  >
                    {!provider.available
                      ? "Not installed"
                      : provider.authenticated === false
                        ? "Sign-in needed"
                        : provider.authenticated === true
                          ? "Ready"
                          : "Installed"}
                  </span>
                  {provider.authenticated === false && provider.auth_command && (
                    <button
                      type="button"
                      onClick={() => void authenticate(provider)}
                      disabled={authBusy !== null}
                      className="rounded border border-border px-2 py-1 text-[10px] text-text hover:border-border-strong disabled:opacity-50"
                      title={provider.auth_hint}
                    >
                      {authBusy === provider.id ? "Opening…" : "Sign in"}
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
          {authNote && (
            <p className="mt-2 rounded border border-border/60 bg-bg/50 px-2.5 py-2 text-[10.5px] text-muted">
              {authNote}
            </p>
          )}
        </Section>

        {/* Remote access */}
        <Section title="Remote access">
          <p className="mb-3 text-[11px] leading-relaxed text-muted">
            Bark is local-first. To reach it from a phone or another machine on
            your LAN, start the server with{" "}
            <code className="font-mono text-text/80">barkcli serve --host 0.0.0.0</code>{" "}
            and open the URL below. Keep the token secret.
          </p>
          <div className="flex gap-2">
            <input
              readOnly
              value={`${apiAccess().base}${apiAccess().token ? `?token=${apiAccess().token}` : ""}`}
              className="flex-1 rounded-md border border-border bg-bg px-2.5 py-1.5 font-mono text-[11px] text-text focus:outline-none"
            />
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(
                    `${apiAccess().base}${apiAccess().token ? `?token=${apiAccess().token}` : ""}`
                  );
                } catch {
                  /* clipboard is optional */
                }
              }}
              className="rounded-md border border-border px-2.5 py-1.5 text-[11px] text-text transition-colors hover:border-border-strong"
            >
              Copy URL
            </button>
          </div>
        </Section>

        {/* Diagnostics */}
        <Section title="Diagnostics">
          <p className="mb-3 text-[11px] leading-relaxed text-muted">
            When a provider or the local server misbehaves, the sidecar log and a
            project terminal are the fastest way to see what happened.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void openLogs()}
              disabled={!isDesktop()}
              className="rounded-md border border-border px-2.5 py-1.5 text-[11px] text-text transition-colors hover:border-border-strong disabled:opacity-40"
            >
              Open server log
            </button>
            <button
              type="button"
              onClick={() => void openTerminal()}
              disabled={!isDesktop()}
              className="rounded-md border border-border px-2.5 py-1.5 text-[11px] text-text transition-colors hover:border-border-strong disabled:opacity-40"
            >
              Open project terminal
            </button>
          </div>
        </Section>

        {/* Remote access */}
        <Section title="Remote access">
          <p className="mb-3 text-[11px] leading-relaxed text-muted">
            Bark is local-first. To reach it from a phone or another machine on
            your LAN, start the server with{" "}
            <code className="font-mono text-text/80">barkcli serve --host 0.0.0.0</code>{" "}
            and open the URL below. Keep the token secret.
          </p>
          <div className="flex gap-2">
            <input
              readOnly
              value={`${apiAccess().base}${apiAccess().token ? `?token=${apiAccess().token}` : ""}`}
              className="flex-1 rounded-md border border-border bg-bg px-2.5 py-1.5 font-mono text-[11px] text-text focus:outline-none"
            />
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(
                    `${apiAccess().base}${apiAccess().token ? `?token=${apiAccess().token}` : ""}`
                  );
                } catch {
                  /* clipboard is optional */
                }
              }}
              className="rounded-md border border-border px-2.5 py-1.5 text-[11px] text-text transition-colors hover:border-border-strong"
            >
              Copy URL
            </button>
          </div>
        </Section>

        {/* Diagnostics */}
        <Section title="Diagnostics">
          <p className="mb-3 text-[11px] leading-relaxed text-muted">
            Run a read-only health check before you ask an agent to work. The
            output is safe to share when filing a bug.
          </p>
          <div className="flex flex-wrap gap-2 mb-3">
            <button
              type="button"
              onClick={() => void runDiagnostics()}
              disabled={diagnosticsBusy}
              className="rounded-md border border-border px-2.5 py-1.5 text-[11px] text-text transition-colors hover:border-border-strong disabled:opacity-40"
            >
              {diagnosticsBusy ? "Running…" : "Run diagnostics"}
            </button>
            <button
              type="button"
              onClick={() => void copyDiagnostics()}
              disabled={!diagnostics}
              className="rounded-md border border-border px-2.5 py-1.5 text-[11px] text-text transition-colors hover:border-border-strong disabled:opacity-40"
            >
              Copy diagnostics
            </button>
            {isDesktop() && (
              <button
                type="button"
                onClick={() => void openLogs()}
                className="rounded-md border border-border px-2.5 py-1.5 text-[11px] text-text transition-colors hover:border-border-strong"
              >
                Open server log
              </button>
            )}
          </div>
          {diagnostics && (
            <div className="space-y-1.5 text-[11px]">
              <div className="flex items-center gap-2">
                <span className={diagnostics.project?.is_git ? "text-success" : "text-warning"}>
                  {diagnostics.project?.is_git ? "✓" : "!"}
                </span>
                <span className="text-muted">Project</span>
                <span className="font-mono text-text/90 truncate">
                  {diagnostics.project?.root || "unknown"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className={diagnostics.project?.setup?.complete ? "text-success" : "text-warning"}>
                  {diagnostics.project?.setup?.complete ? "✓" : "!"}
                </span>
                <span className="text-muted">Setup</span>
                <span className="text-text/90">
                  {diagnostics.project?.setup?.complete ? "complete" : "needs setup"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className={diagnostics.hooks?.installed ? "text-success" : "text-warning"}>
                  {diagnostics.hooks?.installed ? "✓" : "!"}
                </span>
                <span className="text-muted">Agent hooks</span>
                <span className="text-text/90">
                  {diagnostics.hooks?.installed ? "installed" : "not installed"}
                </span>
              </div>
              {Array.isArray(diagnostics.providers) && (
                <div className="flex items-center gap-2">
                  <span className="text-success">✓</span>
                  <span className="text-muted">Providers</span>
                  <span className="text-text/90">
                    {diagnostics.providers.filter((p: any) => p.available).length}/
                    {diagnostics.providers.length} available ·{" "}
                    {diagnostics.providers.filter((p: any) => p.authenticated === true).length} signed in
                  </span>
                </div>
              )}
              {diagnostics.validation && (
                <div className="flex items-center gap-2">
                  <span className={diagnostics.validation.all_valid ? "text-success" : "text-warning"}>
                    {diagnostics.validation.all_valid ? "✓" : "!"}
                  </span>
                  <span className="text-muted">Boards</span>
                  <span className="text-text/90">
                    {diagnostics.validation.all_valid ? "all valid" : "validation issues"}
                  </span>
                </div>
              )}
            </div>
          )}
        </Section>

        {/* AI config */}
        <Section title="AI provider">
          {ai ? (
            <div className="space-y-1.5 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-muted w-20">Base URL</span>
                <span className="font-mono text-muted-strong">{ai.base_url || "(default)"}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted w-20">Model</span>
                <span className="font-mono text-muted-strong">{ai.model || "(default)"}</span>
              </div>
              <p className="text-[11px] text-muted pt-1">
                Configure with <span className="font-mono">barkcli agent config set</span> in the terminal.
              </p>
            </div>
          ) : (
            <p className="text-xs text-muted">No project config found.</p>
          )}
        </Section>
      </div>
    </div>
  );
}
