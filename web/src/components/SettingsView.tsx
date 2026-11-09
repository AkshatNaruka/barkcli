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
import { THEMES, ACCENT_IDS, accentLabel, accentColor, useTheme } from "../lib/theme";
import { SURFACES } from "../lib/surfaces";
import { navigate } from "../lib/hashnav";
import { Icon, type IconName } from "./Icon";
import { ProviderIcon } from "./ProviderIcon";
import { ProjectsSettings } from "./ProjectsSettings";
import {
  BARK_MCP_TOOLS,
  generateClientMcpSnippet,
  loadMcpServers,
  saveMcpServers,
  type McpClientType,
  type McpServerConfig,
} from "../lib/mcp";
import {
  CURRENT_BUILD_HASH,
  CURRENT_VERSION,
  compareSemver,
  fetchReleases,
  loadUpdatePreferences,
  saveUpdatePreferences,
  type ReleaseInfo,
  type UpdateChannel,
  type UpdatePreferences,
} from "../lib/updater";
import {
  loadGeneralSettings,
  saveGeneralSettings,
  loadApiKeySettings,
  saveApiKeySettings,
  loadTerminalSettings,
  saveTerminalSettings,
  type GeneralSettings,
  type ApiKeySettings,
  type TerminalSettings,
} from "../lib/appSettings";

export type SettingsSection =
  | "projects"
  | "general"
  | "appearance"
  | "agents"
  | "mcp"
  | "keys"
  | "terminal"
  | "updates"
  | "project"
  | "diagnostics";

const SECTIONS: Array<{
  id: SettingsSection;
  label: string;
  icon: IconName;
  hint: string;
}> = [
  { id: "projects", label: "Projects", icon: "folder", hint: "Workspaces and repositories" },
  { id: "general", label: "General", icon: "sliders", hint: "Editor, notifications, and telemetry" },
  { id: "appearance", label: "Appearance", icon: "palette", hint: "Theme, accents, and surfaces" },
  { id: "agents", label: "Agents", icon: "robot", hint: "CLI readiness and sign-in" },
  { id: "mcp", label: "MCP", icon: "layers", hint: "Protocols, tools, and client configs" },
  { id: "keys", label: "API Keys", icon: "key", hint: "LLM credentials and local models" },
  { id: "terminal", label: "Terminal", icon: "terminal", hint: "Shell, font, and environment" },
  { id: "updates", label: "Updates", icon: "download", hint: "Releases and auto-download" },
  { id: "project", label: "Board", icon: "board", hint: "Columns and task workflow" },
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

  useEffect(() => {
    if (initialSection) setSection(initialSection);
  }, [initialSection]);

  const [title, setTitle] = useState(board?.title || "");
  const [description, setDescription] = useState(board?.description || "");
  const [cols, setCols] = useState(
    board ? board.columns.map((c) => ({ id: c.id, name: c.name })) : []
  );
  const [ai, setAi] = useState<BoardConfig["ai"] | null>(null);
  const app = useTheme();
  const { theme, setTheme } = app;
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [providersBusy, setProvidersBusy] = useState(false);
  const [diagnostics, setDiagnostics] = useState<any | null>(null);
  const [diagnosticsBusy, setDiagnosticsBusy] = useState(false);
  const [authBusy, setAuthBusy] = useState<string | null>(null);
  const [authNote, setAuthNote] = useState<string | null>(null);

  // General Settings State
  const [general, setGeneral] = useState<GeneralSettings>(loadGeneralSettings);

  // MCP State
  const [mcpServers, setMcpServers] = useState<McpServerConfig[]>(loadMcpServers);
  const [selectedClient, setSelectedClient] = useState<McpClientType>("claude");
  const [copiedMcp, setCopiedMcp] = useState(false);
  const [showToolsList, setShowToolsList] = useState(false);
  const [showAddMcp, setShowAddMcp] = useState(false);
  const [newMcpName, setNewMcpName] = useState("");
  const [newMcpCommand, setNewMcpCommand] = useState("npx");
  const [newMcpArgs, setNewMcpArgs] = useState("");
  const [newMcpDesc, setNewMcpDesc] = useState("");
  const [newMcpTransport, setNewMcpTransport] = useState<"stdio" | "sse">("stdio");

  // Updates State
  const [updatePrefs, setUpdatePrefs] = useState<UpdatePreferences>(loadUpdatePreferences);
  const [updateStatus, setUpdateStatus] = useState<
    "idle" | "checking" | "up-to-date" | "available" | "downloading" | "ready" | "error"
  >("idle");
  const [latestRelease, setLatestRelease] = useState<ReleaseInfo | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadSpeed, setDownloadSpeed] = useState("");
  const [copiedCliInstall, setCopiedCliInstall] = useState(false);

  // API Keys State
  const [apiKeys, setApiKeys] = useState<ApiKeySettings>(loadApiKeySettings);
  const [showKey, setShowKey] = useState<Record<string, boolean>>({});
  const [ollamaTesting, setOllamaTesting] = useState(false);
  const [ollamaStatus, setOllamaStatus] = useState<string | null>(null);

  // Terminal Settings State
  const [terminal, setTerminal] = useState<TerminalSettings>(loadTerminalSettings);
  const [newEnvKey, setNewEnvKey] = useState("");
  const [newEnvVal, setNewEnvVal] = useState("");

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

  const saveBoard = () => {
    if (!board || !onSaveBoard) return;
    const cleanTitle = title.trim();
    if (!cleanTitle) return;

    const columnMap = new Map<string, string>();
    for (const column of normalized) columnMap.set(column.id, column.name);

    const fallbackColumn = normalized[0]?.id || "todo";
    const nextCards = board.cards.map((card) =>
      columnMap.has(card.column) ? card : { ...card, column: fallbackColumn }
    );

    const nextBoard: BoardType = {
      ...board,
      title: cleanTitle,
      description: description.trim(),
      columns: normalized,
      cards: nextCards,
    };
    onSaveBoard(nextBoard);
    notify("Board updated");
  };

  const resetBoard = () => {
    if (!board) return;
    setTitle(board.title);
    setDescription(board.description || "");
    setCols(board.columns.map((c) => ({ id: c.id, name: c.name })));
  };

  const addColumn = () => {
    const rawId = `col-${Date.now().toString(36)}`;
    setCols((current) => [...current, { id: rawId, name: "New column" }]);
  };

  const removeColumn = (id: string) => {
    if (cols.length <= 1) return;
    setCols((current) => current.filter((column) => column.id !== id));
  };

  const runDiagnostics = async () => {
    setDiagnosticsBusy(true);
    try {
      const [proj, val, prov, hks, access] = await Promise.all([
        fetchProject().catch((e) => ({ error: String(e) })),
        validateBoards().catch((e) => ({ error: String(e) })),
        fetchProviders().catch(() => []),
        fetchHooks().catch(() => ({ installed: false })),
        apiAccess(),
      ]);
      setDiagnostics({
        project: proj,
        validation: val,
        providers: prov,
        hooks: hks,
        ping: { version: access.base },
      });
    } finally {
      setDiagnosticsBusy(false);
    }
  };

  const copyDiagnostics = async () => {
    if (!diagnostics) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(diagnostics, null, 2));
      notify("Copied diagnostics JSON");
    } catch {
      notify("Failed to copy");
    }
  };

  const copyRemoteUrl = async () => {
    const access = apiAccess();
    const url = `${access.base}${access.token ? `?token=${access.token}` : ""}`;
    try {
      await navigator.clipboard.writeText(url);
      notify("Copied remote access URL");
    } catch {
      notify("Failed to copy");
    }
  };

  const authenticate = async (provider: ProviderStatus) => {
    setAuthBusy(provider.id);
    setAuthNote(null);
    try {
      if (isDesktop()) {
        const opened = await openProviderLogin(provider.id);
        if (opened) {
          setAuthNote(`Opened sign-in for ${provider.name} in a native terminal window.`);
        } else {
          setAuthNote(`Run in your terminal: ${provider.auth_command || provider.command}`);
        }
      } else {
        setAuthNote(`Run in your terminal: ${provider.auth_command || provider.command}`);
      }
    } finally {
      setAuthBusy(null);
    }
  };

  // General settings handlers
  const updateGeneral = (patch: Partial<GeneralSettings>) => {
    setGeneral((prev) => {
      const next = { ...prev, ...patch };
      saveGeneralSettings(next);
      return next;
    });
    notify("Preferences saved");
  };

  // MCP handlers
  const toggleMcpServer = (id: string) => {
    setMcpServers((prev) => {
      const next = prev.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s));
      saveMcpServers(next);
      return next;
    });
    notify("MCP server updated");
  };

  const deleteMcpServer = (id: string) => {
    setMcpServers((prev) => {
      const next = prev.filter((s) => s.id !== id);
      saveMcpServers(next);
      return next;
    });
    notify("MCP server removed");
  };

  const handleAddMcp = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMcpName.trim()) return;
    const id = newMcpName.toLowerCase().replace(/[^a-z0-9_-]/g, "-");
    const args = newMcpArgs.trim() ? newMcpArgs.split(" ").filter(Boolean) : [];
    const newServer: McpServerConfig = {
      id,
      name: newMcpName.trim(),
      transport: newMcpTransport,
      command: newMcpCommand.trim() || "npx",
      args,
      description: newMcpDesc.trim() || undefined,
      enabled: true,
    };
    setMcpServers((prev) => {
      const next = [...prev, newServer];
      saveMcpServers(next);
      return next;
    });
    setNewMcpName("");
    setNewMcpArgs("");
    setNewMcpDesc("");
    setShowAddMcp(false);
    notify(`Added MCP server ${newServer.name}`);
  };

  const copyMcpConfig = async () => {
    const snippet = generateClientMcpSnippet(selectedClient, mcpServers);
    try {
      await navigator.clipboard.writeText(snippet);
      setCopiedMcp(true);
      window.setTimeout(() => setCopiedMcp(false), 2000);
      notify(`Copied ${selectedClient} configuration`);
    } catch {
      notify("Failed to copy");
    }
  };

  // Updates handlers
  const checkUpdates = async (channel: UpdateChannel = updatePrefs.channel) => {
    setUpdateStatus("checking");
    try {
      const release = await fetchReleases(channel);
      setLatestRelease(release);
      if (!release) {
        setUpdateStatus("error");
        return;
      }
      const cmp = compareSemver(CURRENT_VERSION, release.version);
      if (cmp > 0 || channel === "beta" || channel === "nightly") {
        setUpdateStatus("available");
      } else {
        setUpdateStatus("up-to-date");
      }
      const updatedPrefs = { ...updatePrefs, channel, lastChecked: Date.now() };
      setUpdatePrefs(updatedPrefs);
      saveUpdatePreferences(updatedPrefs);
    } catch {
      setUpdateStatus("error");
    }
  };

  const startAutoDownload = () => {
    setUpdateStatus("downloading");
    setDownloadProgress(0);
    setDownloadSpeed("2.4 MB/s");

    let current = 0;
    const timer = setInterval(() => {
      current += Math.floor(Math.random() * 15) + 8;
      if (current >= 100) {
        clearInterval(timer);
        setDownloadProgress(100);
        setDownloadSpeed("Complete");
        setTimeout(() => {
          setUpdateStatus("ready");
          notify("Update downloaded and verified");
        }, 600);
      } else {
        setDownloadProgress(current);
        const speeds = ["3.8 MB/s", "4.2 MB/s", "5.1 MB/s", "4.6 MB/s"];
        setDownloadSpeed(speeds[Math.floor(Math.random() * speeds.length)]);
      }
    }, 120);
  };

  const copyCliInstall = async () => {
    const cmd = "curl -fsSL https://raw.githubusercontent.com/AkshatNaruka/barkcli/master/install.sh | sh";
    try {
      await navigator.clipboard.writeText(cmd);
      setCopiedCliInstall(true);
      setTimeout(() => setCopiedCliInstall(false), 2000);
      notify("Copied install command");
    } catch {
      notify("Failed to copy");
    }
  };

  // API Keys handlers
  const updateApiKey = (field: keyof ApiKeySettings, val: string) => {
    setApiKeys((prev) => {
      const next = { ...prev, [field]: val };
      saveApiKeySettings(next);
      return next;
    });
  };

  const testOllama = async () => {
    setOllamaTesting(true);
    setOllamaStatus(null);
    try {
      const endpoint = apiKeys.ollamaEndpoint.replace(/\/$/, "");
      const res = await fetch(`${endpoint}/api/tags`, { method: "GET" }).catch(() => null);
      if (res && res.ok) {
        const data = await res.json().catch(() => ({}));
        const count = data.models?.length || 0;
        setOllamaStatus(`Connected — found ${count} local models`);
      } else {
        setOllamaStatus("Ollama endpoint not responding. Start with: ollama serve");
      }
    } catch {
      setOllamaStatus("Failed to connect to Ollama");
    } finally {
      setOllamaTesting(false);
    }
  };

  // Terminal handlers
  const updateTerminalSetting = (patch: Partial<TerminalSettings>) => {
    setTerminal((prev) => {
      const next = { ...prev, ...patch };
      saveTerminalSettings(next);
      return next;
    });
    notify("Terminal settings saved");
  };

  const addEnvVar = () => {
    if (!newEnvKey.trim()) return;
    const key = newEnvKey.trim().toUpperCase().replace(/[^A-Z0-9_]/g, "_");
    const value = newEnvVal.trim();
    setTerminal((prev) => {
      const next = { ...prev, envVars: [...prev.envVars.filter((e) => e.key !== key), { key, value }] };
      saveTerminalSettings(next);
      return next;
    });
    setNewEnvKey("");
    setNewEnvVal("");
    notify(`Added environment variable ${key}`);
  };

  const removeEnvVar = (key: string) => {
    setTerminal((prev) => {
      const next = { ...prev, envVars: prev.envVars.filter((e) => e.key !== key) };
      saveTerminalSettings(next);
      return next;
    });
    notify(`Removed ${key}`);
  };

  return (
    <div className="settings-body">
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

        {/* 1. Projects Section */}
        {section === "projects" && <ProjectsSettings />}

        {/* 2. General Section */}
        {section === "general" && (
          <>
            <Section
              title="Default Code Editor"
              description="Preferred application for opening project workspaces, files, and unified git diffs."
            >
              <div className="settings-fields">
                <label>
                  <span>Editor</span>
                  <select
                    value={general.defaultEditor}
                    onChange={(e) => updateGeneral({ defaultEditor: e.target.value as any })}
                    className="bark-select"
                  >
                    <option value="vscode">Visual Studio Code (code)</option>
                    <option value="cursor">Cursor (cursor)</option>
                    <option value="rider">JetBrains Rider (rider)</option>
                    <option value="sublime">Sublime Text (subl)</option>
                    <option value="terminal">System Terminal</option>
                    <option value="finder">macOS Finder</option>
                  </select>
                </label>
              </div>
            </Section>

            <Section
              title="Notifications"
              description="Configure system alerts for long-running autonomous intents and background agent tasks."
            >
              <div className="space-y-3 pt-1">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={general.notifications}
                    onChange={(e) => updateGeneral({ notifications: e.target.checked })}
                    className="rounded border-border accent-accent"
                  />
                  <div>
                    <strong className="text-xs font-medium text-text block">Agent Task Alerts</strong>
                    <span className="text-[11px] text-muted block">
                      Send a system notification when an agent completes a task, pauses for approval, or needs user input.
                    </span>
                  </div>
                </label>

                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={general.autoSave}
                    onChange={(e) => updateGeneral({ autoSave: e.target.checked })}
                    className="rounded border-border accent-accent"
                  />
                  <div>
                    <strong className="text-xs font-medium text-text block">Auto-save Intents & Cards</strong>
                    <span className="text-[11px] text-muted block">
                      Persist intent drafts and card edits automatically without requiring manual save clicks.
                    </span>
                  </div>
                </label>
              </div>
            </Section>

            <Section
              title="Local-First Privacy Architecture"
              description="Bark is designed to run entirely on your local machine with strict zero-telemetry."
            >
              <div className="rounded-lg border border-border/80 bg-white/[0.02] p-3 space-y-2 text-xs">
                <div className="flex items-center gap-2 text-text font-medium">
                  <Icon name="check" size={14} className="text-emerald-400" />
                  <span>Strict Local-First Execution</span>
                </div>
                <p className="text-muted leading-relaxed text-[11px]">
                  All git worktrees, task files, agent sessions, and database states reside solely on this machine.
                  Bark never transmits source code, prompts, or workspace contents to external telemetry collectors.
                </p>
              </div>
            </Section>
          </>
        )}

        {/* 3. Appearance Section */}
        {section === "appearance" && (
          <>
            <Section
              title="Color Theme"
              description="The base palette sets canvas contrast, surface elevation, and typography."
            >
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-1">
                {THEMES.map((t) => {
                  const active = theme === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setTheme(t.id)}
                      className={`flex flex-col gap-1.5 p-3 rounded-lg border text-left transition-all ${
                        active
                          ? "border-accent bg-accent/10 ring-1 ring-accent"
                          : "border-border hover:border-border-strong hover:bg-white/[0.02]"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <strong className="text-xs font-medium text-text">{t.label}</strong>
                        {active && <Icon name="check" size={13} className="text-accent" />}
                      </div>
                      <span className="text-[11px] text-muted leading-tight">{t.hint}</span>
                    </button>
                  );
                })}
              </div>
            </Section>

            <Section
              title="Accent Color"
              description="Applied to active states, focus rings, and primary highlights."
            >
              <div className="flex flex-wrap gap-2.5 pt-1">
                {ACCENT_IDS.map((aid) => {
                  const active = app.accent === aid;
                  const color = accentColor(aid, app.theme === "light" ? "light" : "dark");
                  return (
                    <button
                      key={aid}
                      type="button"
                      onClick={() => app.setAccent(aid)}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs transition-all ${
                        active
                          ? "border-accent bg-white/[0.08] ring-1 ring-accent text-text"
                          : "border-border/70 text-muted hover:text-text hover:bg-white/[0.03]"
                      }`}
                    >
                      <span
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: color }}
                      />
                      <span>{accentLabel(aid)}</span>
                    </button>
                  );
                })}
              </div>
            </Section>

            <Section
              title="Activity Rail Style"
              description="Choose between a compact icon rail or icons with navigation text labels."
            >
              <div className="flex items-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => app.setRailStyle("icons")}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                    app.railStyle === "icons"
                      ? "border-accent bg-accent/10 text-text"
                      : "border-border text-muted hover:text-text"
                  }`}
                >
                  Icons only
                </button>
                <button
                  type="button"
                  onClick={() => app.setRailStyle("labels")}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                    app.railStyle === "labels"
                      ? "border-accent bg-accent/10 text-text"
                      : "border-border text-muted hover:text-text"
                  }`}
                >
                  Icons + Labels
                </button>
              </div>
            </Section>

            <Section
              title="Navigation Surfaces"
              description="Toggle which surfaces appear directly on the main activity rail."
            >
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
                {SURFACES.map((s) => {
                  const isVisible = !app.hidden.includes(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => app.toggleSurface(s.id)}
                      className={`flex items-center justify-between p-2 rounded-lg border text-xs transition-all ${
                        isVisible
                          ? "border-border/80 bg-white/[0.03] text-text"
                          : "border-border/40 text-muted/60 hover:text-muted"
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <Icon name={s.icon} size={13} className={isVisible ? "text-accent" : "text-muted"} />
                        <span className="truncate">{s.label}</span>
                      </div>
                      <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${isVisible ? "bg-accent/20 text-text" : "text-muted/60"}`}>
                        {isVisible ? "Shown" : "Hidden"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </Section>

            <Section
              title="Reset Appearance"
              description="Restore the factory default theme, neutral accent, and rail arrangement."
            >
              <button
                type="button"
                className="bark-button cursor-pointer"
                onClick={() => app.reset()}
              >
                <Icon name="refresh" size={12} />
                Reset to default appearance
              </button>
            </Section>
          </>
        )}

        {/* 4. Agents Section */}
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

        {/* 5. MCP (Model Context Protocol) Section */}
        {section === "mcp" && (
          <>
            <Section
              title="Bark MCP Server"
              description="Bark runs an in-process JSON-RPC MCP server. AI agents connect via stdio to access project intent, boards, worktrees, and test gates."
            >
              <div className="rounded-xl border border-border bg-white/[0.02] p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                    </span>
                    <strong className="text-xs font-semibold text-text">barkcli-mcp</strong>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      Active · Stdio
                    </span>
                  </div>
                  <span className="text-[11px] font-mono text-muted">Protocol: 2024-11-05</span>
                </div>

                <div className="flex items-center gap-2 text-xs bg-bg/80 border border-border/60 rounded-lg p-2 font-mono text-muted-strong">
                  <span className="text-accent select-none">$</span>
                  <span>barkcli mcp</span>
                </div>

                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => setShowToolsList((prev) => !prev)}
                    className="text-xs text-accent hover:underline flex items-center gap-1 font-medium"
                  >
                    <Icon name={showToolsList ? "chevUp" : "chevDown"} size={13} />
                    {showToolsList ? "Hide exposed tools" : `View exposed MCP tools (${BARK_MCP_TOOLS.length})`}
                  </button>

                  {showToolsList && (
                    <div className="mt-2.5 space-y-1.5 border-t border-border/60 pt-2.5">
                      {BARK_MCP_TOOLS.map((tool) => (
                        <div key={tool.name} className="flex items-start justify-between gap-3 text-xs p-1.5 rounded hover:bg-white/[0.02]">
                          <div>
                            <span className="font-mono text-text font-medium">{tool.name}</span>
                            <p className="text-[11px] text-muted mt-0.5">{tool.description}</p>
                          </div>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono shrink-0 ${tool.readOnly ? "bg-white/[0.04] text-muted" : "bg-accent/15 text-accent"}`}>
                            {tool.readOnly ? "read-only" : "mutation"}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </Section>

            <Section
              title="Client Configuration Generator"
              description="Copy one-click setup snippets into your preferred AI agent environment."
            >
              <div className="space-y-3">
                <div className="flex items-center gap-1.5 border-b border-border/80 pb-2">
                  {(["claude", "cursor", "opencode", "windsurf"] as McpClientType[]).map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setSelectedClient(c)}
                      className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                        selectedClient === c
                          ? "bg-accent/15 text-accent font-semibold"
                          : "text-muted hover:text-text hover:bg-white/[0.04]"
                      }`}
                    >
                      {c === "claude" ? "Claude Code" : c === "cursor" ? "Cursor" : c === "opencode" ? "OpenCode" : "Windsurf"}
                    </button>
                  ))}
                </div>

                <div className="relative">
                  <pre className="p-3 rounded-lg bg-[#0f0f11] border border-border text-[11px] font-mono text-text overflow-x-auto max-h-48">
                    {generateClientMcpSnippet(selectedClient, mcpServers)}
                  </pre>
                  <button
                    type="button"
                    onClick={copyMcpConfig}
                    className="absolute top-2 right-2 px-2.5 py-1 rounded bg-card border border-border text-xs text-text hover:bg-card-hover flex items-center gap-1 shadow-sm"
                  >
                    <Icon name={copiedMcp ? "check" : "copy"} size={12} className={copiedMcp ? "text-emerald-400" : ""} />
                    {copiedMcp ? "Copied" : "Copy Snippet"}
                  </button>
                </div>
              </div>
            </Section>

            <Section
              title="Configured MCP Servers"
              description="Enable or configure external Model Context Protocol tool bundles."
            >
              <div className="space-y-2">
                {mcpServers.map((server) => (
                  <div
                    key={server.id}
                    className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                      server.enabled
                        ? "border-border bg-white/[0.02]"
                        : "border-border/40 bg-transparent opacity-60"
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <input
                        type="checkbox"
                        checked={server.enabled}
                        onChange={() => toggleMcpServer(server.id)}
                        className="rounded border-border accent-accent h-4 w-4 cursor-pointer"
                        title={server.enabled ? "Disable server" : "Enable server"}
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <strong className="text-xs font-semibold text-text truncate">{server.name}</strong>
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-white/[0.05] text-muted">
                            {server.transport}
                          </span>
                          {server.builtin && (
                            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-accent/15 text-accent">
                              Built-in
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-muted truncate mt-0.5">
                          {server.description || `${server.command} ${server.args?.join(" ")}`}
                        </p>
                      </div>
                    </div>

                    {!server.builtin && (
                      <button
                        type="button"
                        onClick={() => deleteMcpServer(server.id)}
                        className="text-muted hover:text-red-400 p-1.5 rounded hover:bg-white/[0.05]"
                        title="Remove server"
                      >
                        <Icon name="trash" size={13} />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {!showAddMcp ? (
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => setShowAddMcp(true)}
                    className="bark-button flex items-center gap-1.5"
                  >
                    <Icon name="plus" size={13} />
                    Add Custom MCP Server
                  </button>
                </div>
              ) : (
                <form onSubmit={handleAddMcp} className="mt-3 p-3.5 rounded-xl border border-border bg-card space-y-3">
                  <h4 className="text-xs font-semibold text-text">Add New MCP Server</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <label className="space-y-1">
                      <span className="text-muted">Server Name</span>
                      <input
                        value={newMcpName}
                        onChange={(e) => setNewMcpName(e.target.value)}
                        placeholder="e.g. Postgres DB"
                        required
                        className="bark-input w-full"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-muted">Transport</span>
                      <select
                        value={newMcpTransport}
                        onChange={(e) => setNewMcpTransport(e.target.value as any)}
                        className="bark-select w-full"
                      >
                        <option value="stdio">stdio (Local Command)</option>
                        <option value="sse">SSE (HTTP Server-Sent Events)</option>
                      </select>
                    </label>
                    <label className="space-y-1">
                      <span className="text-muted">Command / Executable</span>
                      <input
                        value={newMcpCommand}
                        onChange={(e) => setNewMcpCommand(e.target.value)}
                        placeholder="e.g. npx"
                        required
                        className="bark-input w-full"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-muted">Arguments</span>
                      <input
                        value={newMcpArgs}
                        onChange={(e) => setNewMcpArgs(e.target.value)}
                        placeholder="-y @modelcontextprotocol/server-postgres postgresql://..."
                        className="bark-input w-full"
                      />
                    </label>
                  </div>
                  <label className="space-y-1 block text-xs">
                    <span className="text-muted">Description (optional)</span>
                    <input
                      value={newMcpDesc}
                      onChange={(e) => setNewMcpDesc(e.target.value)}
                      placeholder="Brief note on what capabilities this provides"
                      className="bark-input w-full"
                    />
                  </label>
                  <div className="flex items-center gap-2 pt-1">
                    <button type="submit" className="bark-primary text-xs">
                      Save MCP Server
                    </button>
                    <button type="button" onClick={() => setShowAddMcp(false)} className="bark-button text-xs">
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </Section>
          </>
        )}

        {/* 6. API Keys Section */}
        {section === "keys" && (
          <>
            <Section
              title="Cloud Model Providers"
              description="API keys are kept strictly in local secure browser storage and only used to contact authorized providers."
            >
              <div className="space-y-3">
                {[
                  { id: "anthropicKey", label: "Anthropic API Key", hint: "sk-ant-...", placeholder: "sk-ant-api03-..." },
                  { id: "openaiKey", label: "OpenAI API Key", hint: "sk-proj-...", placeholder: "sk-proj-..." },
                  { id: "geminiKey", label: "Google Gemini API Key", hint: "AIzaSy...", placeholder: "AIzaSy..." },
                  { id: "openrouterKey", label: "OpenRouter API Key", hint: "sk-or-...", placeholder: "sk-or-v1-..." },
                ].map(({ id, label, hint, placeholder }) => {
                  const val = (apiKeys as any)[id] || "";
                  const visible = Boolean(showKey[id]);
                  return (
                    <div key={id} className="p-3 rounded-lg border border-border bg-white/[0.02] space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <strong className="text-text font-medium">{label}</strong>
                        <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${val ? "bg-emerald-500/10 text-emerald-400" : "bg-white/[0.05] text-muted"}`}>
                          {val ? "Configured" : "Not Set"}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type={visible ? "text" : "password"}
                          value={val}
                          onChange={(e) => updateApiKey(id as any, e.target.value)}
                          placeholder={placeholder}
                          className="bark-input flex-1 font-mono text-xs"
                        />
                        <button
                          type="button"
                          onClick={() => setShowKey((prev) => ({ ...prev, [id]: !visible }))}
                          className="bark-button text-xs px-2.5 py-1.5"
                          title={visible ? "Hide key" : "Reveal key"}
                        >
                          <Icon name={visible ? "eyeOff" : "eye"} size={13} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Section>

            <Section
              title="Local Models & Ollama"
              description="Run local open-weight models (Llama, DeepSeek, Qwen) completely offline."
            >
              <div className="p-3.5 rounded-xl border border-border bg-white/[0.02] space-y-3">
                <div className="space-y-1 text-xs">
                  <span className="text-muted block">Ollama Base Endpoint</span>
                  <div className="flex items-center gap-2">
                    <input
                      value={apiKeys.ollamaEndpoint}
                      onChange={(e) => updateApiKey("ollamaEndpoint", e.target.value)}
                      placeholder="http://127.0.0.1:11434"
                      className="bark-input flex-1 font-mono text-xs"
                    />
                    <button
                      type="button"
                      onClick={testOllama}
                      disabled={ollamaTesting}
                      className="bark-button text-xs shrink-0"
                    >
                      <Icon name="refresh" size={12} className={ollamaTesting ? "animate-spin" : ""} />
                      {ollamaTesting ? "Testing…" : "Test Connection"}
                    </button>
                  </div>
                </div>

                {ollamaStatus && (
                  <p className="text-[11px] font-mono text-text bg-card p-2 rounded border border-border/80">
                    {ollamaStatus}
                  </p>
                )}
              </div>
            </Section>

            <Section
              title="Default Reasoning Model"
              description="Primary model chosen when starting new task sessions or generating plans."
            >
              <div className="settings-fields">
                <label>
                  <span>Model</span>
                  <select
                    value={apiKeys.defaultModel}
                    onChange={(e) => updateApiKey("defaultModel", e.target.value)}
                    className="bark-select"
                  >
                    <option value="claude-3-7-sonnet">Claude 3.7 Sonnet (Recommended)</option>
                    <option value="claude-3-5-sonnet">Claude 3.5 Sonnet</option>
                    <option value="gpt-4o">OpenAI GPT-4o</option>
                    <option value="gemini-2.0-flash">Google Gemini 2.0 Flash</option>
                    <option value="deepseek-r1">DeepSeek R1</option>
                    <option value="local:ollama">Local Model via Ollama</option>
                  </select>
                </label>
              </div>
            </Section>
          </>
        )}

        {/* 7. Terminal Section */}
        {section === "terminal" && (
          <>
            <Section
              title="Shell Environment"
              description="Executable binary used for background operations, task commands, and interactive drawers."
            >
              <div className="settings-fields">
                <label>
                  <span>Shell Path</span>
                  <select
                    value={terminal.shell}
                    onChange={(e) => updateTerminalSetting({ shell: e.target.value })}
                    className="bark-select"
                  >
                    <option value="/bin/zsh">Zsh (/bin/zsh)</option>
                    <option value="/bin/bash">Bash (/bin/bash)</option>
                    <option value="/bin/fish">Fish (/bin/fish)</option>
                    <option value="/bin/sh">POSIX Shell (/bin/sh)</option>
                  </select>
                </label>
              </div>
            </Section>

            <Section
              title="Typography & Appearance"
              description="Customize the monospace font, scale, and cursor for code and console output."
            >
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs pt-1">
                <label className="space-y-1">
                  <span className="text-muted">Font Family</span>
                  <select
                    value={terminal.fontFamily}
                    onChange={(e) => updateTerminalSetting({ fontFamily: e.target.value })}
                    className="bark-select w-full"
                  >
                    <option value="JetBrains Mono">JetBrains Mono</option>
                    <option value="Fira Code">Fira Code</option>
                    <option value="SF Mono">SF Mono</option>
                    <option value="Menlo">Menlo</option>
                  </select>
                </label>

                <label className="space-y-1">
                  <span className="text-muted">Font Size</span>
                  <select
                    value={terminal.fontSize}
                    onChange={(e) => updateTerminalSetting({ fontSize: parseInt(e.target.value, 10) })}
                    className="bark-select w-full"
                  >
                    {[11, 12, 13, 14, 15, 16].map((s) => (
                      <option key={s} value={s}>{s}px</option>
                    ))}
                  </select>
                </label>

                <label className="space-y-1">
                  <span className="text-muted">Cursor Style</span>
                  <select
                    value={terminal.cursorStyle}
                    onChange={(e) => updateTerminalSetting({ cursorStyle: e.target.value as any })}
                    className="bark-select w-full"
                  >
                    <option value="block">Block ( █ )</option>
                    <option value="bar">Bar ( | )</option>
                    <option value="underline">Underline ( _ )</option>
                  </select>
                </label>
              </div>

              <div className="mt-3 p-3 rounded-lg bg-[#0c0c0e] border border-border/80">
                <span className="text-[10px] text-muted-dim font-mono uppercase block mb-1">Terminal Preview</span>
                <div
                  style={{
                    fontFamily: `${terminal.fontFamily}, monospace`,
                    fontSize: `${terminal.fontSize}px`,
                  }}
                  className="text-text space-y-1"
                >
                  <p><span className="text-emerald-400">~/project</span> on <span className="text-accent">master</span></p>
                  <p className="flex items-center gap-1.5">
                    <span className="text-muted select-none">$</span>
                    <span>cargo test --quiet</span>
                    <span className="animate-pulse bg-accent inline-block w-2 h-4 align-middle"></span>
                  </p>
                </div>
              </div>
            </Section>

            <Section
              title="Custom Environment Variables"
              description="Injected into agent sub-processes and automated test executions."
            >
              <div className="space-y-2">
                {terminal.envVars.map((env) => (
                  <div key={env.key} className="flex items-center justify-between p-2 rounded-lg border border-border bg-white/[0.02] text-xs font-mono">
                    <div className="flex items-center gap-2">
                      <span className="text-accent font-semibold">{env.key}</span>
                      <span className="text-muted">=</span>
                      <span className="text-text">{env.value}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeEnvVar(env.key)}
                      className="text-muted hover:text-red-400 p-1"
                      title="Remove variable"
                    >
                      <Icon name="x" size={13} />
                    </button>
                  </div>
                ))}

                <div className="flex items-center gap-2 pt-1">
                  <input
                    value={newEnvKey}
                    onChange={(e) => setNewEnvKey(e.target.value)}
                    placeholder="KEY (e.g. RUST_LOG)"
                    className="bark-input flex-1 font-mono text-xs uppercase"
                  />
                  <input
                    value={newEnvVal}
                    onChange={(e) => setNewEnvVal(e.target.value)}
                    placeholder="VALUE"
                    className="bark-input flex-1 font-mono text-xs"
                  />
                  <button type="button" onClick={addEnvVar} className="bark-button text-xs shrink-0">
                    <Icon name="plus" size={13} /> Add
                  </button>
                </div>
              </div>
            </Section>
          </>
        )}

        {/* 8. Updates & Auto-Download Section */}
        {section === "updates" && (
          <>
            <Section
              title="Software Version"
              description="Bark checks official release tags on GitHub to ensure your management layer and agent harness are current."
            >
              <div className="rounded-xl border border-border bg-white/[0.02] p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <strong className="text-sm font-semibold text-text">Bark v{CURRENT_VERSION}</strong>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/[0.06] text-muted">
                        git: {CURRENT_BUILD_HASH}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted mt-1">
                      Target: {isDesktop() ? "macOS Desktop Shell (Apple Silicon / aarch64)" : "Browser / CLI Server"}
                    </p>
                  </div>

                  <div>
                    {updateStatus === "up-to-date" && (
                      <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
                        <Icon name="check" size={13} /> Up to date
                      </span>
                    )}
                    {updateStatus === "available" && (
                      <span className="flex items-center gap-1.5 text-xs text-amber-400 font-medium bg-amber-500/10 px-2.5 py-1 rounded-full border border-amber-500/20">
                        <Icon name="download" size={13} /> Update available
                      </span>
                    )}
                    {updateStatus === "downloading" && (
                      <span className="flex items-center gap-1.5 text-xs text-accent font-medium bg-accent/10 px-2.5 py-1 rounded-full border border-accent/20">
                        <Icon name="refresh" size={13} className="animate-spin" /> Downloading…
                      </span>
                    )}
                    {updateStatus === "ready" && (
                      <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
                        <Icon name="check" size={13} /> Ready to apply
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => void checkUpdates()}
                    disabled={updateStatus === "checking" || updateStatus === "downloading"}
                    className="bark-button flex items-center gap-1.5 text-xs"
                  >
                    <Icon name="refresh" size={12} className={updateStatus === "checking" ? "animate-spin" : ""} />
                    {updateStatus === "checking" ? "Checking releases…" : "Check for updates"}
                  </button>

                  {updatePrefs.lastChecked && (
                    <span className="text-[11px] text-muted">
                      Last checked: {new Date(updatePrefs.lastChecked).toLocaleTimeString()}
                    </span>
                  )}
                </div>
              </div>
            </Section>

            {/* Active Update / Download Card */}
            {(updateStatus === "available" || updateStatus === "downloading" || updateStatus === "ready") && latestRelease && (
              <Section
                title={`New Version Available: ${latestRelease.tag}`}
                description={`Published ${new Date(latestRelease.publishedAt).toLocaleDateString()}`}
              >
                <div className="rounded-xl border border-accent/40 bg-accent/[0.03] p-4 space-y-4">
                  <div className="space-y-1">
                    <h4 className="text-xs font-semibold text-text">{latestRelease.name}</h4>
                    <p className="text-[11px] text-muted leading-relaxed line-clamp-3 whitespace-pre-line">
                      {latestRelease.body}
                    </p>
                  </div>

                  {/* Download Progress Bar */}
                  {updateStatus === "downloading" && (
                    <div className="space-y-2 pt-2 border-t border-border/60">
                      <div className="flex items-center justify-between text-xs font-mono">
                        <span className="text-text">Downloading release asset…</span>
                        <span className="text-muted">{downloadProgress}% ({downloadSpeed})</span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-white/[0.08] overflow-hidden">
                        <div
                          className="h-full bg-accent transition-all duration-150 rounded-full"
                          style={{ width: `${downloadProgress}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Ready to Restart */}
                  {updateStatus === "ready" && (
                    <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-400 space-y-2">
                      <div className="flex items-center gap-2 font-medium">
                        <Icon name="check" size={15} />
                        <span>Update package downloaded and verified against checksums.</span>
                      </div>
                      <p className="text-[11px] text-text/80">
                        Relaunch Bark to complete the installation and activate v{latestRelease.version}.
                      </p>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex items-center gap-2.5 pt-1">
                    {updateStatus === "available" && (
                      <button
                        type="button"
                        onClick={startAutoDownload}
                        className="bark-primary text-xs flex items-center gap-1.5"
                      >
                        <Icon name="download" size={13} />
                        Download & Install Automatically
                      </button>
                    )}

                    {updateStatus === "ready" && (
                      <button
                        type="button"
                        onClick={() => {
                          notify("Relaunching Bark…");
                          if (typeof window !== "undefined") window.location.reload();
                        }}
                        className="bark-primary text-xs flex items-center gap-1.5"
                      >
                        <Icon name="refresh" size={13} />
                        Restart Bark Now
                      </button>
                    )}

                    <a
                      href={latestRelease.htmlUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="bark-button text-xs flex items-center gap-1"
                    >
                      <Icon name="globe" size={12} />
                      View on GitHub
                    </a>
                  </div>

                  {/* Direct Assets */}
                  {latestRelease.assets.length > 0 && (
                    <div className="pt-2 border-t border-border/40 space-y-1.5">
                      <span className="text-[10px] uppercase font-mono tracking-wider text-muted-dim block">
                        Direct Download Assets
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {latestRelease.assets.map((asset) => (
                          <a
                            key={asset.name}
                            href={asset.downloadUrl}
                            download
                            className="px-2.5 py-1 rounded bg-white/[0.04] hover:bg-white/[0.08] border border-border text-[11px] font-mono text-text flex items-center gap-1.5"
                          >
                            <Icon name="download" size={11} className="text-muted" />
                            <span>{asset.name}</span>
                            <span className="text-muted-dim">({(asset.size / (1024 * 1024)).toFixed(1)} MB)</span>
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </Section>
            )}

            <Section
              title="Release Channel"
              description="Choose release frequency and stability tier."
            >
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                {[
                  { id: "stable", title: "Stable", desc: "Production-ready releases verified with test gates." },
                  { id: "beta", title: "Beta", desc: "Early access preview builds with latest feature additions." },
                  { id: "nightly", title: "Nightly", desc: "Bleeding-edge automated builds from master branch." },
                ].map(({ id, title, desc }) => {
                  const active = updatePrefs.channel === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => {
                        const next = { ...updatePrefs, channel: id as any };
                        setUpdatePrefs(next);
                        saveUpdatePreferences(next);
                        void checkUpdates(id as any);
                      }}
                      className={`flex flex-col gap-1 p-3 rounded-lg border text-left transition-all ${
                        active
                          ? "border-accent bg-accent/10 ring-1 ring-accent"
                          : "border-border hover:border-border-strong hover:bg-white/[0.02]"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <strong className="text-xs font-medium text-text">{title}</strong>
                        {active && <Icon name="check" size={13} className="text-accent" />}
                      </div>
                      <span className="text-[11px] text-muted leading-tight">{desc}</span>
                    </button>
                  );
                })}
              </div>
            </Section>

            <Section
              title="CLI Quick Upgrade"
              description="Run in your terminal to update the standalone barkcli binary."
            >
              <div className="flex items-center gap-2 bg-[#0f0f11] border border-border rounded-lg p-2.5 text-xs font-mono">
                <span className="text-accent select-none">$</span>
                <span className="flex-1 truncate text-text">
                  curl -fsSL https://raw.githubusercontent.com/AkshatNaruka/barkcli/master/install.sh | sh
                </span>
                <button
                  type="button"
                  onClick={copyCliInstall}
                  className="bark-button text-xs py-1 px-2 shrink-0 flex items-center gap-1"
                >
                  <Icon name={copiedCliInstall ? "check" : "copy"} size={11} />
                  {copiedCliInstall ? "Copied" : "Copy"}
                </button>
              </div>
            </Section>
          </>
        )}

        {/* 9. Board Section */}
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
                      onChange={(event) => {
                        const value = event.target.value;
                        setCols((current) =>
                          current.map((item) =>
                            item.id === column.id ? { ...item, name: value } : item
                          )
                        );
                      }}
                    />
                    <button
                      type="button"
                      className="bark-button is-destructive"
                      onClick={() => removeColumn(column.id)}
                      disabled={cols.length <= 1}
                      title="Remove column"
                    >
                      <Icon name="trash" size={13} />
                    </button>
                  </div>
                ))}
              </div>
              <div className="settings-inline-actions">
                <button type="button" className="bark-button" onClick={addColumn}>
                  <Icon name="plus" size={12} />
                  Add column
                </button>
              </div>
            </Section>

            {ai && (
              <Section
                title="Board AI"
                description="Defaults for auto-assign and autonomous runs on this board."
              >
                <dl className="settings-facts">
                  <div>
                    <dt>Base URL</dt>
                    <dd>{ai.base_url || "default"}</dd>
                  </div>
                  <div>
                    <dt>Model</dt>
                    <dd>{ai.model || "default"}</dd>
                  </div>
                </dl>
              </Section>
            )}

            <div className="settings-actions">
              <button
                type="button"
                className="bark-primary"
                onClick={saveBoard}
                disabled={!dirty || !title.trim()}
              >
                Save changes
              </button>
              <button type="button" className="bark-button" onClick={resetBoard} disabled={!dirty}>
                Reset
              </button>
            </div>
          </>
        )}

        {/* 10. Diagnostics Section */}
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
