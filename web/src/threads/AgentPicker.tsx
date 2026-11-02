import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { fetchProviderModels } from "../lib/api";
import { navigate } from "../lib/hashnav";
import { readLocal, writeLocal } from "../lib/drafts";
import type { AgentSelection } from "../lib/useAgentSelection";
import { Icon } from "../components/Icon";
import { ProviderIcon } from "../components/ProviderIcon";
import { QuietSelect } from "../components/QuietSelect";
import type { ComposerMode } from "../lib/composer";

const FAVORITES_KEY = "bark:model-favorites:v1";
const RAIL_WIDTH = 54;
const PANEL_WIDTH = 560;
const MAX_PANEL_HEIGHT = 480;

type ModelRow = { provider: string; providerName: string; id: string };

function modelKey(provider: string, model: string) {
  return `${provider}::${model}`;
}

function modelLabel(id: string) {
  const parts = id.split("/");
  return parts.length > 1 ? parts.slice(1).join("/") : id;
}

function providerState(provider: AgentSelection["providers"][number]) {
  if (!provider.available) return "Not installed";
  if (provider.authenticated === false) return "Sign-in needed";
  if (provider.authenticated === true) return "Ready";
  return "Installed; sign-in not confirmed";
}

function readFavorites(): string[] {
  try {
    const value = JSON.parse(readLocal(FAVORITES_KEY) || "[]");
    return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function AgentPicker({ agent, mode }: { agent: AgentSelection; mode: ComposerMode }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<string>("favorites");
  const [query, setQuery] = useState("");
  const [favorites, setFavorites] = useState<string[]>(readFavorites);
  const [catalogs, setCatalogs] = useState<Record<string, string[]>>({});
  const [loadingModels, setLoadingModels] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [customModel, setCustomModel] = useState("");
  const [position, setPosition] = useState<{
    left: number;
    width: number;
    maxHeight: number;
    top?: number;
    bottom?: number;
  }>({ left: 12, width: PANEL_WIDTH, maxHeight: MAX_PANEL_HEIGHT });
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  const providerKey = agent.providers.map((provider) => provider.id).join(",");

  const place = () => {
    const rect = trigger.current?.getBoundingClientRect();
    if (!rect) return;
    const composer = trigger.current?.closest(".thread-composer")?.getBoundingClientRect();
    const anchorTop = composer?.top ?? rect.top;
    const width = Math.min(PANEL_WIDTH, window.innerWidth - 24);
    const left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12));
    const roomAbove = anchorTop - 20;
    if (roomAbove >= 260) {
      setPosition({
        left,
        width,
        maxHeight: Math.min(MAX_PANEL_HEIGHT, roomAbove),
        bottom: window.innerHeight - anchorTop + 8,
      });
    } else {
      setPosition({
        left,
        width,
        maxHeight: Math.min(MAX_PANEL_HEIGHT, window.innerHeight - rect.bottom - 20),
        top: rect.bottom + 8,
      });
    }
  };

  const close = (restoreFocus = false) => {
    setOpen(false);
    setCustomOpen(false);
    setCustomModel("");
    if (restoreFocus) window.setTimeout(() => trigger.current?.focus(), 0);
  };

  const toggle = () => {
    if (open) {
      close();
      return;
    }
    setView(agent.backend || agent.providers[0]?.id || "favorites");
    setQuery("");
    place();
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    place();
    const onResize = () => place();
    window.addEventListener("resize", onResize);
    const down = (event: PointerEvent) => {
      if (
        panel.current?.contains(event.target as Node) ||
        trigger.current?.contains(event.target as Node)
      ) {
        return;
      }
      close();
    };
    document.addEventListener("pointerdown", down, true);
    return () => {
      window.removeEventListener("resize", onResize);
      document.removeEventListener("pointerdown", down, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingModels(true);
    Promise.all(
      agent.providers.map(async (provider) => {
        const models = await fetchProviderModels(provider.id);
        return [provider.id, models] as const;
      })
    )
      .then((entries) => {
        if (!cancelled) setCatalogs(Object.fromEntries(entries));
      })
      .finally(() => {
        if (!cancelled) setLoadingModels(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, providerKey]);

  const allRows = useMemo<ModelRow[]>(
    () =>
      agent.providers.flatMap((provider) => {
        const models =
          catalogs[provider.id] ??
          (provider.id === agent.backend ? agent.modelOptions : []);
        return models.map((id) => ({
          provider: provider.id,
          providerName: provider.name,
          id,
        }));
      }),
    [agent.providers, agent.backend, agent.modelOptions, catalogs]
  );

  const q = query.trim().toLowerCase();
  const matchesQuery = (row: ModelRow) =>
    !q ||
    `${row.id} ${modelLabel(row.id)} ${row.providerName}`.toLowerCase().includes(q);

  const visible = useMemo(() => {
    if (view === "favorites") {
      return allRows.filter(
        (row) => favorites.includes(modelKey(row.provider, row.id)) && matchesQuery(row)
      );
    }
    return allRows.filter((row) => row.provider === view && matchesQuery(row));
  }, [allRows, favorites, view, q]);

  const visibleRef = useRef<ModelRow[]>(visible);
  visibleRef.current = visible;

  const choose = (provider: string, model: string) => {
    agent.selectChoice(provider, model);
    close(true);
  };

  const toggleFavorite = (row: ModelRow) => {
    const key = modelKey(row.provider, row.id);
    const next = favorites.includes(key)
      ? favorites.filter((item) => item !== key)
      : [...favorites, key];
    setFavorites(next);
    writeLocal(FAVORITES_KEY, JSON.stringify(next));
  };

  const viewedProvider = agent.providers.find((provider) => provider.id === view);
  const viewedStatus = viewedProvider ? providerState(viewedProvider) : null;

  useEffect(() => {
    if (!open) return;
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close(true);
        return;
      }
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
      const index = Number(event.key) - 1;
      if (index < 0 || index > 4) return;
      event.preventDefault();
      event.stopPropagation();
      const row = visibleRef.current[index];
      if (row) choose(row.provider, row.id);
    };
    document.addEventListener("keydown", keydown, true);
    return () => document.removeEventListener("keydown", keydown, true);
  }, [open, favorites, agent]);

  const submitCustom = () => {
    const value = customModel.trim();
    if (!value || view === "favorites") return;
    choose(view, value);
  };

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="agent-trigger"
        aria-label={`Agent and model: ${agent.selected?.name || agent.backend || "none"}, ${agent.model || "CLI default"}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={toggle}
      >
        {agent.selected ? (
          <ProviderIcon id={agent.selected.id} name={agent.selected.name} size={14} />
        ) : (
          <Icon name="robot" size={14} />
        )}
        <span className="agent-model-label">{agent.model ? modelLabel(agent.model) : agent.selected?.name || agent.backend || "Choose agent"}</span>
        <Icon name="arrowDown" size={10} />
      </button>

      {open &&
        createPortal(
          <div
            ref={panel}
            className="model-popover"
            role="dialog"
            aria-label="Agent and model"
            style={position}
          >
            <div className="model-rail" aria-label="Providers">
              <button
                type="button"
                className={`model-rail-button ${view === "favorites" ? "is-active" : ""}`}
                aria-label="Favorite models"
                aria-pressed={view === "favorites"}
                title="Favorite models"
                onClick={() => {
                  setView("favorites");
                  setQuery("");
                  setCustomOpen(false);
                }}
              >
                <Icon name="star" size={17} />
              </button>
              <div className="model-rail-sep" role="separator" />
              {agent.providers.map((provider) => {
                const state = providerState(provider);
                return (
                  <button
                    key={provider.id}
                    type="button"
                    className={`model-rail-button ${view === provider.id ? "is-active" : ""}`}
                    aria-label={`${provider.name}: ${state}`}
                    aria-pressed={view === provider.id}
                    title={`${provider.name} · ${state}`}
                    onClick={() => {
                      setView(provider.id);
                      setQuery("");
                      setCustomOpen(false);
                    }}
                  >
                    <span className="model-rail-mono"><ProviderIcon id={provider.id} name={provider.name} size={22} /></span>
                    <span
                      className={`model-rail-dot ${
                        !provider.available
                          ? "is-off"
                          : provider.authenticated === false
                            ? "is-warn"
                            : provider.authenticated === true
                              ? "is-ready"
                              : "is-unknown"
                      }`}
                    />
                  </button>
                );
              })}
            </div>

            <div className="model-main">
              <div className="model-search">
                <Icon name="search" size={13} />
                <input
                  autoFocus
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.preventDefault();
                      close(true);
                    }
                    if (event.key === "ArrowDown") {
                      event.preventDefault();
                      panel.current?.querySelector<HTMLButtonElement>(".model-select")?.focus();
                    }
                  }}
                  aria-label="Search models"
                  placeholder={view === "favorites" ? "Search favorite models…" : "Search models…"}
                />
              </div>

              <div className="model-status" role="status">
                <span
                  className={`model-status-dot ${
                    view === "favorites"
                      ? "is-ready"
                      : !viewedProvider?.available
                        ? "is-off"
                        : viewedProvider.authenticated === false
                          ? "is-warn"
                          : "is-ready"
                  }`}
                />
                <span>{view === "favorites" ? "Favorite models" : `${viewedProvider?.name || view} · ${viewedStatus || "Checking…"}`}</span>
                {view !== "favorites" && viewedStatus && viewedStatus !== "Ready" && (
                  <span className="model-status-actions">
                    <button type="button" onClick={agent.recheck}>Recheck</button>
                    <button type="button" onClick={() => { close(); navigate("operations", { tool: "workspace" }); }}>Setup</button>
                  </span>
                )}
              </div>

              <div className="model-list" role="listbox" aria-label="Models">
                {view !== "favorites" && (!q || "cli default".includes(q)) && (
                  <div className={`model-row ${agent.backend === view && !agent.model ? "is-selected" : ""}`}>
                    <button type="button" className="model-select" aria-pressed={agent.backend === view && !agent.model} onClick={() => choose(view, "")}>
                      <span className="model-copy"><strong>CLI default</strong><small>Use the provider&apos;s default model</small></span>
                      {agent.backend === view && !agent.model && <Icon name="check" size={14} />}
                    </button>
                  </div>
                )}
                {loadingModels && !visible.length ? (
                  <div className="model-empty">Reading model lists…</div>
                ) : view === "favorites" && !favorites.length ? (
                  <div className="model-empty">
                    No favorites yet. Star a model to keep it here.
                  </div>
                ) : !visible.length ? (
                  <div className="model-empty">
                    {q
                      ? `No models match “${query}”.`
                      : view === "favorites"
                        ? "No favorite models yet."
                        : "This CLI does not advertise models. Use CLI default or a custom id."}
                  </div>
                ) : (
                  <>
                    {visible.map((row, index) => {
                      const selected = agent.backend === row.provider && agent.model === row.id;
                      const favorite = favorites.includes(modelKey(row.provider, row.id));
                      return (
                        <div
                          key={modelKey(row.provider, row.id)}
                          className={`model-row ${selected ? "is-selected" : ""}`}
                        >
                          <button
                            type="button"
                            className="model-select"
                            aria-pressed={selected}
                            title={row.id}
                            onClick={() => choose(row.provider, row.id)}
                          >
                            <span className="model-copy">
                              <strong>{modelLabel(row.id)}</strong>
                              <small><ProviderIcon id={row.provider} name={row.providerName} size={11} className="model-provider-icon" /><span>{row.providerName}</span></small>
                            </span>
                            {index < 5 && <kbd className="model-key">⌘{index + 1}</kbd>}
                            {selected && <Icon name="check" size={14} />}
                          </button>
                          <button
                            type="button"
                            className={`model-star ${favorite ? "is-favorite" : ""}`}
                            aria-label={`${favorite ? "Unstar" : "Star"} ${row.id}`}
                            aria-pressed={favorite}
                            onClick={() => toggleFavorite(row)}
                          >
                            <Icon name="star" size={14} />
                          </button>
                        </div>
                      );
                    })}
                  </>
                )}

                {view !== "favorites" && (
                  customOpen ? (
                    <form
                      className="model-custom"
                      onSubmit={(event) => {
                        event.preventDefault();
                        submitCustom();
                      }}
                    >
                      <input
                        autoFocus
                        value={customModel}
                        onChange={(event) => setCustomModel(event.target.value)}
                        placeholder="model id"
                        aria-label="Custom model id"
                        spellCheck={false}
                      />
                      <button type="submit" disabled={!customModel.trim()}>Use</button>
                    </form>
                  ) : (
                    <button
                      type="button"
                      className="model-custom-trigger"
                      onClick={() => {
                        setCustomOpen(true);
                        setCustomModel(agent.model || "");
                      }}
                    >
                      Use a custom model id…
                    </button>
                  )
                )}
              </div>

              {mode === "build" && (
                <details className="model-build">
                  <summary>Build options</summary>
                  <label htmlFor="agent-build-role">Role</label>
                  <QuietSelect id="agent-build-role" aria-label="Role" className="bark-field" value={agent.role} onChange={(event) => agent.setRole(event.target.value)}>
                    {agent.roles.length ? agent.roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>) : <option value="builder">Builder</option>}
                  </QuietSelect>
                  <label htmlFor="agent-build-checks">Verification command</label>
                  <input id="agent-build-checks" className="bark-field" value={agent.testCommand} onChange={(event) => agent.setTestCommand(event.target.value)} placeholder="Detect from this project" spellCheck={false} autoComplete="off" />
                  <p>A custom command runs in the isolated worktree. Checks must pass before merge.</p>
                </details>
              )}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
