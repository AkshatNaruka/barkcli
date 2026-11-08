import React, { useEffect, useMemo, useState } from "react";
import type { Board as BoardType, ProviderStatus } from "../lib/types";
import {
  apiAccess,
  fetchConfig,
  fetchHooks,
  fetchProject,
  fetchProviders,
  validateBoards,
  type BoardConfig,
} from "../lib/api";
import { isDesktop, openLogs, openProviderLogin, openTerminal } from "../lib/desktop";
import { THEMES, useTheme } from "../lib/theme";
import { navigate } from "../lib/hashnav";
import { Icon, type IconName } from "./Icon";
import { ProviderIcon } from "./ProviderIcon";
import { ProjectsSettings } from "./ProjectsSettings";

type SettingsSection = "projects" | "project" | "appearance" | "agents" | "diagnostics";

const SECTIONS: Array<{
  id: SettingsSection;
  label: string;
  icon: IconName;
  hint: string;
}> = [
  { id: "projects", label: "Projects", icon: "folder", hint: "Workspaces and repositories" },
  { id: "project", label: "Board", icon: "board", hint: "Board and columns" },
  { id: "appearance", label: "Appearance", icon: "palette", hint: "Theme and density" },
  { id: "agents", label: "Agents", icon: "robot", hint: "CLI readiness and sign-in" },
  { id: "diagnostics", label: "Diagnostics", icon: "pulse", hint: "Health, logs, and access" },
];


function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="settings-section">
      <header>
        <h3>{title}</h3>
        {description && <p>{description}</p>}
      </header>
      {children}
    </section>
  );
}

function providerState(provider: ProviderStatus): { label: string; tone: string } {
  if (!provider.available) return { label: "Not installed", tone: "off" };
  if (provider.authenticated === false) return { label: "Sign-in needed", tone: "warn" };
  if (provider.authenticated === true) return { label: "Ready", tone: "ready" };
  return { label: "Installed", tone: "idle" };
}

export function SettingsView({
  board,
  onSaveBoard,
  initialSection,
}: {
  board?: BoardType | null;
  onSaveBoard?: (b: BoardType) => void;
  initialSection?: SettingsSection;
}) {
  const [section, setSection] = useState<SettingsSection>(
    initialSection || (board ? "project" : "projects")
  );
  const [title, setTitle] = useState(board?.title || "");
  const [description, setDescription] = useState(board?.description || "");
  const [cols, setCols] = useState(
    board ? board.columns.map((c) => ({ id: c.id, name: c.name })) : []
  );
  const [ai, setAi] = useState<BoardConfig["ai"] | null>(null);
  const { theme, setTheme } = useTheme();
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [providersBusy, setProvidersBusy] = useState(false);
  const [diagnostics, setDiagnostics] = useState<any | null>(null);
  const [diagnosticsBusy, setDiagnosticsBusy] = useState(false);
  const [authBusy, setAuthBusy] = useState<string | null>(null);
  const [authNote, setAuthNote] = useState<string | null>(null);

  useEffect(() => {
    if (board) {
      setTitle(board.title);
      setDescription(board.description || "");
      setCols(board.columns.map((c) => ({ id: c.id, name: c.name })));
    }
  }, [board?.title, board?.description, board?.columns]);

  useEffect(() => {
    fetchConfig().then((c) => setAi(c?.ai ?? null)).catch(() => setAi(null));
    void loadProviders();
  }, []);

  const loadProviders = async () => {
    setProvidersBusy(true);
    try {
      const next = await fetchProviders();
      setProviders(next.filter((provider) => provider.id !== "human"));
    } finally {
      setProvidersBusy(false);
    }
  };

  const notify = (msg: string) => {
    setSavedMsg(msg);
    window.setTimeout(() => setSavedMsg(null), 2800);
  };

  const normalized = useMemo(
    () =>
      cols.map((column) => ({
        id: column.id,
        name: column.name.trim() || column.id,
      })),
    [cols]
  );

  const dirty = Boolean(
    board &&
      (title.trim() !== board.title ||
        (description.trim() || "") !== (board.description || "") ||
        JSON.stringify(normalized) !==
          JSON.stringify(board.columns.map((column) => ({ id: column.id, name: column.name }))))
  );

  const saveProject = () => {
    if (!board || !onSaveBoard) return;
    const removed = new Set(
      board.columns
        .map((column) => column.id)
        .filter((id) => !normalized.some((column) => column.id === id))
    );
    const first = normalized[0]?.id || board.columns[0]?.id || "todo";
    const next: BoardType = {
      ...board,
      title: title.trim() || board.title,
      description: description.trim() || undefined,
      columns: normalized,
      cards: board.cards.map((card) =>
        removed.has(card.column) ? { ...card, column: first } : card
      ),
    };
    onSaveBoard(next);
    notify("Project settings saved");
  };

  const addColumn = () => {
    const base = "new-column";
    let id = base;
    let index = 2;
    while (cols.some((column) => column.id === id)) {
      id = `${base}-${index}`;
      index += 1;
    }
    setCols([...cols, { id, name: "New column" }]);
  };

  const removeColumn = (id: string) => {
    if (cols.length <= 1) return;
    setCols(cols.filter((column) => column.id !== id));
  };

  const authenticate = async (provider: ProviderStatus) => {
    setAuthNote(null);
    if (isDesktop()) {
      setAuthBusy(provider.id);
      const opened = await openProviderLogin(provider.id);
      setAuthBusy(null);
      setAuthNote(
        opened
          ? `${provider.name} sign-in opened in Terminal. Finish there, then recheck.`
          : `Could not open a terminal for ${provider.name}. Open the project terminal from Diagnostics.`
      );
      return;
    }
    if (!provider.auth_command) {
      setAuthNote(`${provider.name} does not expose a local sign-in command.`);
      return;
    }
    try {
      await navigator.clipboard.writeText(provider.auth_command);
      setAuthNote(`Copied \`${provider.auth_command}\`. Run it, then recheck.`);
    } catch {
      setAuthNote(`Run \`${provider.auth_command}\`, then recheck.`);
    }
  };

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
      notify("Diagnostics copied");
    } catch {
      notify("Could not copy diagnostics");
    }
  };

  const copyRemoteUrl = async () => {
    try {
      await navigator.clipboard.writeText(
        `${apiAccess().base}${apiAccess().token ? `?token=${apiAccess().token}` : ""}`
      );
      notify("Remote URL copied");
    } catch {
      notify("Could not copy the URL");
    }
  };

  return (
    <div className="settings-shell">
      <nav className="settings-nav" aria-label="Settings sections">
        <div className="settings-nav-head">
          <span className="settings-nav-eyebrow">Settings</span>
          <strong>{board?.title || "Preferences"}</strong>
        </div>
        {SECTIONS.filter((item) => (item.id === "project" ? Boolean(board) : true)).map((item) => {
          const active = section === item.id;
          return (
            <button
              key={item.id}
              type="button"
              aria-current={active ? "page" : undefined}
              onClick={() => setSection(item.id)}
            >
              <Icon name={item.icon} size={14} />
              <span>
                <strong>{item.label}</strong>
                <small>{item.hint}</small>
              </span>
            </button>
          );
        })}
      </nav>

      <div className="settings-content">
        <div className="settings-content-head">
          <h2>{SECTIONS.find((item) => item.id === section)?.label}</h2>
          <p>{SECTIONS.find((item) => item.id === section)?.hint}</p>
        </div>

        {savedMsg && (
          <div className="settings-saved" role="status">
            <Icon name="check" size={12} />
            {savedMsg}
          </div>
        )}

        {section === "projects" && (
          <ProjectsSettings />
        )}

        {section === "project" && (
          <>
            <Section title="Board" description="The name and description shown on this board.">
              <div className="settings-fields">
                <label>
                  <span>Title</span>
                  <input value={title} onChange={(event) => setTitle(event.target.value)} />
                </label>
                <label>
                  <span>Description</span>
                  <textarea
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    rows={2}
                    placeholder="What is this board for?"
                  />
                </label>
              </div>
            </Section>

            <Section
              title="Columns"
              description="Cards in a removed column move to the first column when you save."
            >
              <div className="settings-columns">
                {cols.map((column) => (
                  <div key={column.id} className="settings-column">
                    <span className="settings-column-id">{column.id}</span>
                    <input
                      value={column.name}
                      aria-label={`Name for ${column.id}`}
                      onChange={(event) =>
                        setCols(
                          cols.map((item) =>
                            item.id === column.id
                              ? { ...item, name: event.target.value }
                              : item
                          )
                        )
                      }
                    />
                    <button
                      type="button"
                      onClick={() => removeColumn(column.id)}
                      disabled={cols.length <= 1}
                      aria-label={`Remove ${column.name}`}
                      title="Remove column"
                    >
                      <Icon name="x" size={13} />
                    </button>
                  </div>
                ))}
                <button type="button" className="settings-add-column" onClick={addColumn}>
                  <Icon name="plus" size={12} />
                  Add column
                </button>
              </div>
            </Section>

            <div className="settings-actions">
              <button
                type="button"
                className="bark-primary"
                onClick={saveProject}
                disabled={!dirty}
              >
                Save changes
              </button>
              <button
                type="button"
                className="bark-button"
                onClick={() => {
                  if (board) {
                    setTitle(board.title);
                    setDescription(board.description || "");
                    setCols(board.columns.map((column) => ({ id: column.id, name: column.name })));
                  }
                }}
                disabled={!dirty}
              >
                Discard
              </button>
              {dirty && <span className="settings-dirty">Unsaved changes</span>}
            </div>

            {ai && (
              <Section title="Agent endpoint" description="Read from the project config.">
                <dl className="settings-facts">
                  <div>
                    <dt>Base URL</dt>
                    <dd><code>{ai.base_url || "Local default"}</code></dd>
                  </div>
                  <div>
                    <dt>Model</dt>
                    <dd>{ai.model || "CLI default"}</dd>
                  </div>
                </dl>
              </Section>
            )}
          </>
        )}

        {section === "appearance" && (
          <>
            <Section
              title="Theme"
              description="Changes apply immediately and stay on this machine."
            >
              <div className="settings-themes">
                {THEMES.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={theme === item.id}
                    className={theme === item.id ? "is-active" : ""}
                    onClick={() => setTheme(item.id)}
                  >
                    <span className="settings-theme-swatch" aria-hidden="true">
                      {item.preview.map((color, index) => (
                        <i key={index} style={{ background: color }} />
                      ))}
                    </span>
                    <span>
                      <strong>{item.label}</strong>
                      <small>{item.hint}</small>
                    </span>
                    {theme === item.id && <Icon name="check" size={13} />}
                  </button>
                ))}
              </div>
            </Section>

            <Section
              title="Custom appearance"
              description="Accent colors and shareable presets."
            >
              <button
                type="button"
                className="bark-button"
                onClick={() =>
                  window.dispatchEvent(new CustomEvent("bark-command", { detail: "appearance" }))
                }
              >
                <Icon name="palette" size={13} />
                Customize appearance
              </button>
            </Section>
          </>
        )}

        {section === "agents" && (
          <>
            <Section
              title="Local coding agents"
              description="Bark runs the CLIs installed on this machine. It never reports an unavailable provider as ready."
            >
              <div className="settings-agents">
                {providers.length === 0 ? (
                  <p className="settings-empty">
                    No local agents reported by the server. Open project setup to check
                    the CLI installation.
                  </p>
                ) : (
                  providers.map((provider) => {
                    const state = providerState(provider);
                    return (
                      <div key={provider.id} className="settings-agent">
                        <ProviderIcon id={provider.id} name={provider.name} size={20} />
                        <div className="settings-agent-copy">
                          <strong>{provider.name}</strong>
                          <small>
                            {provider.command}
                            {provider.version ? ` · ${provider.version}` : ""}
                          </small>
                        </div>
                        <span className={`settings-status is-${state.tone}`}>{state.label}</span>
                        {provider.available && provider.authenticated !== true && provider.auth_command ? (
                          <button
                            type="button"
                            className="bark-button"
                            onClick={() => void authenticate(provider)}
                            disabled={authBusy !== null}
                            title={provider.auth_hint}
                          >
                            {authBusy === provider.id ? "Opening…" : "Sign in"}
                          </button>
                        ) : null}
                      </div>
                    );
                  })
                )}
              </div>
              <div className="settings-inline-actions">
                <button type="button" className="bark-button" onClick={() => void loadProviders()} disabled={providersBusy}>
                  <Icon name="refresh" size={12} />
                  {providersBusy ? "Checking…" : "Recheck"}
                </button>
                <button
                  type="button"
                  className="bark-button"
                  onClick={() => navigate("operations", { tool: "workspace" })}
                >
                  Project setup
                </button>
              </div>
              {authNote && <p className="settings-note">{authNote}</p>}
            </Section>

            <Section
              title="Agent behavior"
              description="Rules and automations are project tools, not global settings."
            >
              <div className="settings-inline-actions">
                <button type="button" className="bark-button" onClick={() => navigate("operations", { tool: "rules" })}>
                  Rules
                </button>
                <button type="button" className="bark-button" onClick={() => navigate("operations", { tool: "automations" })}>
                  Automations
                </button>
                <button type="button" className="bark-button" onClick={() => navigate("skills")}>
                  Skills
                </button>
              </div>
            </Section>
          </>
        )}

        {section === "diagnostics" && (
          <>
            <Section
              title="Health check"
              description="Run a read-only check before asking an agent to work. The output is safe to share."
            >
              <div className="settings-inline-actions">
                <button type="button" className="bark-primary" onClick={() => void runDiagnostics()} disabled={diagnosticsBusy}>
                  {diagnosticsBusy ? "Running…" : "Run diagnostics"}
                </button>
                <button type="button" className="bark-button" onClick={() => void copyDiagnostics()} disabled={!diagnostics}>
                  Copy diagnostics
                </button>
              </div>
              {diagnostics && (
                <dl className="settings-facts is-diagnostics">
                  <div>
                    <dt>Project</dt>
                    <dd>
                      <span className={diagnostics.project?.is_git ? "is-ok" : "is-warn"}>
                        {diagnostics.project?.is_git ? "Git" : "No Git"}
                      </span>
                      <code>{diagnostics.project?.root || "unknown"}</code>
                    </dd>
                  </div>
                  <div>
                    <dt>Setup</dt>
                    <dd>{diagnostics.project?.setup?.complete ? "Complete" : "Needs setup"}</dd>
                  </div>
                  <div>
                    <dt>Agent hooks</dt>
                    <dd>{diagnostics.hooks?.installed ? "Installed" : "Not installed"}</dd>
                  </div>
                  <div>
                    <dt>Providers</dt>
                    <dd>
                      {diagnostics.providers?.filter((provider: ProviderStatus) => provider.available).length || 0}/
                      {diagnostics.providers?.length || 0} available ·{" "}
                      {diagnostics.providers?.filter((provider: ProviderStatus) => provider.authenticated === true).length || 0} signed in
                    </dd>
                  </div>
                  <div>
                    <dt>Boards</dt>
                    <dd>{diagnostics.validation?.all_valid ? "All valid" : "Validation issues"}</dd>
                  </div>
                  <div>
                    <dt>Server</dt>
                    <dd>{diagnostics.ping?.version || "responding"}</dd>
                  </div>
                </dl>
              )}
            </Section>

            <Section
              title="Logs and terminal"
              description="These open native apps on this machine."
            >
              <div className="settings-inline-actions">
                <button type="button" className="bark-button" onClick={() => void openLogs()} disabled={!isDesktop()}>
                  Open server log
                </button>
                <button type="button" className="bark-button" onClick={() => void openTerminal()} disabled={!isDesktop()}>
                  Open project terminal
                </button>
              </div>
              {!isDesktop() && (
                <p className="settings-note">
                  Native logs and terminals are available in the Bark Mac app.
                </p>
              )}
            </Section>

            <Section
              title="Remote access"
              description="Bark is local-first. Share this URL only on a network you trust."
            >
              <div className="settings-copy-row">
                <input
                  readOnly
                  value={`${apiAccess().base}${apiAccess().token ? `?token=${apiAccess().token}` : ""}`}
                  aria-label="Remote access URL"
                />
                <button type="button" className="bark-button" onClick={() => void copyRemoteUrl()}>
                  Copy URL
                </button>
              </div>
              <p className="settings-note">
                Start with <code>barkcli serve --host 0.0.0.0</code> to reach this project
                from another device. Keep the token secret.
              </p>
            </Section>
          </>
        )}
      </div>
    </div>
  );
}
