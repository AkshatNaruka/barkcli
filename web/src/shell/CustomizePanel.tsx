import React, { useEffect, useMemo, useState } from "react";
import { Icon } from "../components/Icon";
import { SURFACES } from "../lib/surfaces";
import {
  ACCENT_IDS,
  THEMES,
  accentColor,
  accentLabel,
  parseAppearance,
  shareUrl,
  useTheme,
  type AccentId,
} from "../lib/theme";

function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  return new Promise((resolve, reject) => {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
      resolve();
    } catch (e) {
      reject(e);
    }
  });
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="px-5 py-4 border-b border-border/70">
      <div className="flex items-baseline justify-between mb-2.5">
        <h3 className="text-[11px] uppercase tracking-[0.12em] text-muted-strong">{title}</h3>
        {hint && <span className="text-[10px] text-muted/70">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

export function CustomizePanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const app = useTheme();
  const [copied, setCopied] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const flash = (label: string) => {
    setCopied(label);
    window.setTimeout(() => setCopied(null), 1600);
  };

  const visible = useMemo(
    () => app.railOrder.filter((id) => !app.hidden.includes(id)),
    [app.railOrder, app.hidden]
  );

  if (!open) return null;

  const appearance = {
    theme: app.theme,
    accent: app.accent,
    railStyle: app.railStyle,
    railOrder: app.railOrder,
    hidden: app.hidden,
  };

  const applyImport = () => {
    const parsed = parseAppearance(importText);
    if (!parsed) {
      setImportError("That doesn't look like a Bark preset.");
      return;
    }
    app.setAppearance(parsed);
    setImportText("");
    setImportError(null);
    setImportOpen(false);
    flash("Preset applied");
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex justify-end bg-black/55 backdrop-blur-[2px]"
      onMouseDown={onClose}
      role="dialog"
      aria-label="Appearance"
    >
      <aside
        className="h-full w-[392px] max-w-[94vw] bg-surface border-l border-border shadow-2xl flex flex-col"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="h-12 px-4 flex items-center gap-2.5 border-b border-border shrink-0">
          <Icon name="palette" size={16} className="text-accent-text" />
          <h2 className="text-[13px] font-medium text-text">Appearance</h2>
          <span className="text-[10px] text-muted/70 font-mono">⌘,</span>
          <button
            onClick={onClose}
            className="ml-auto w-7 h-7 rounded-md flex items-center justify-center text-muted hover:text-text hover:bg-white/[0.05]"
            title="Close"
          >
            <Icon name="x" size={14} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto">
          {/* Live preview */}
          <div className="px-5 pt-4">
            <div className="rounded-xl border border-border overflow-hidden bg-bg">
              <div className="h-[86px] flex">
                <div className={`${app.railStyle === "labels" ? "w-16" : "w-8"} border-r border-border flex flex-col items-center gap-1.5 py-2.5`}>
                  <span className="w-4 h-4 rounded-[5px]" style={{ background: "var(--accent)" }} />
                  <span className="w-4 h-4 rounded-[5px]" style={{ background: "var(--accent-soft)" }} />
                  <span className="w-3 h-3 rounded-[4px] bg-white/[0.08]" />
                  <span className="w-3 h-3 rounded-[4px] bg-white/[0.05]" />
                </div>
                <div className="flex-1 p-2 flex gap-1.5">
                  <div className="flex-1 rounded-md border border-border p-1.5" style={{ background: "var(--card)" }}>
                    <span className="block h-1.5 w-10 rounded-full" style={{ background: "var(--accent)" }} />
                    <span className="block mt-1.5 h-1 w-16 rounded-full" style={{ background: "var(--text)", opacity: 0.12 }} />
                    <span className="block mt-1 h-1 w-12 rounded-full" style={{ background: "var(--text)", opacity: 0.08 }} />
                  </div>
                  <div className="w-9 rounded-md border border-border" style={{ background: "var(--surface)" }} />
                </div>
              </div>
            </div>
          </div>

          <Section title="Theme" hint={THEMES.find((t) => t.id === app.theme)?.label}>
            <div className="grid grid-cols-2 gap-2">
              {THEMES.map((t) => {
                const active = app.theme === t.id;
                const previewInk = t.id === "light" || t.system ? "rgba(26,23,20,0.22)" : "rgba(255,255,255,0.22)";
                return (
                  <button
                    key={t.id}
                    onClick={() => app.setTheme(t.id)}
                    className={`group rounded-lg border p-1.5 text-left transition-colors ${
                      active
                        ? "border-accent/60 bg-accent-soft"
                        : "border-border hover:border-border-strong bg-card/60"
                    }`}
                    title={t.hint}
                  >
                    <span
                      className="block h-12 rounded-md overflow-hidden"
                      style={{
                        background: t.system
                          ? `linear-gradient(90deg, ${t.preview[0]} 50%, ${t.preview[1]} 50%)`
                          : t.preview[0],
                      }}
                    >
                      <span className="flex h-full">
                        <span className="w-2.5 h-full" style={{ background: t.system ? t.preview[0] : t.preview[1] }} />
                        <span className="flex-1 p-1.5 flex flex-col gap-1">
                          <span className="h-1.5 w-8 rounded-full" style={{ background: t.preview[2] }} />
                          <span className="h-1 w-10 rounded-full" style={{ background: previewInk }} />
                          <span className="h-1 w-7 rounded-full" style={{ background: previewInk, opacity: 0.5 }} />
                        </span>
                      </span>
                    </span>
                    <span className="mt-1.5 flex items-center gap-1.5 px-0.5">
                      <span className={`text-[11.5px] ${active ? "text-text" : "text-muted-strong"}`}>{t.label}</span>
                      {active && <Icon name="check" size={11} className="ml-auto text-accent-text" />}
                    </span>
                  </button>
                );
              })}
            </div>
          </Section>

          <Section title="Accent" hint={accentLabel(app.accent)}>
            <div className="flex items-center gap-2">
              {ACCENT_IDS.map((id: AccentId) => {
                const active = app.accent === id;
                return (
                  <button
                    key={id}
                    onClick={() => app.setAccent(id)}
                    title={accentLabel(id)}
                    className={`relative w-7 h-7 rounded-full flex items-center justify-center transition-transform hover:scale-110 ${
                      active ? "ring-2 ring-white/40 ring-offset-2 ring-offset-surface" : ""
                    }`}
                    style={{ background: accentColor(id, app.theme === "light" ? "light" : "dark") }}
                  >
                    {active && <Icon name="check" size={12} className="text-white drop-shadow" />}
                  </button>
                );
              })}
            </div>
          </Section>

          <Section title="Rail" hint={app.railStyle === "icons" ? "Icons only" : "With labels"}>
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-card p-1 border border-border">
              {(["icons", "labels"] as const).map((style) => (
                <button
                  key={style}
                  onClick={() => app.setRailStyle(style)}
                  className={`h-7 rounded-md text-[11.5px] transition-colors ${
                    app.railStyle === style ? "bg-accent-soft text-accent-text" : "text-muted hover:text-text"
                  }`}
                >
                  {style === "icons" ? "Icons" : "Labels"}
                </button>
              ))}
            </div>
          </Section>

          <Section title="Surfaces" hint="Reorder · hide">
            <div className="space-y-0.5">
              {app.railOrder.map((id) => {
                const def = SURFACES.find((s) => s.id === id);
                if (!def) return null;
                const hidden = app.hidden.includes(id);
                const pos = visible.indexOf(id);
                return (
                  <div
                    key={id}
                    className={`flex items-center gap-2.5 px-2 py-1.5 rounded-md ${
                      hidden ? "opacity-45" : "hover:bg-white/[0.03]"
                    }`}
                  >
                    <Icon
                      name={def.icon}
                      size={14}
                      className={hidden ? "text-muted" : "text-accent-text"}
                    />
                    <span className={`text-[12px] flex-1 ${hidden ? "text-muted" : "text-text"}`}>
                      {def.label}
                    </span>
                    <div className="flex items-center gap-0.5">
                      <button
                        onClick={() => app.moveSurface(id, -1)}
                        disabled={hidden || pos <= 0}
                        className="w-6 h-6 rounded flex items-center justify-center text-muted hover:text-text disabled:opacity-20"
                        title="Move up"
                      >
                        <Icon name="arrowUp" size={11} />
                      </button>
                      <button
                        onClick={() => app.moveSurface(id, 1)}
                        disabled={hidden || pos < 0 || pos >= visible.length - 1}
                        className="w-6 h-6 rounded flex items-center justify-center text-muted hover:text-text disabled:opacity-20"
                        title="Move down"
                      >
                        <Icon name="arrowDown" size={11} />
                      </button>
                      <button
                        onClick={() => app.toggleSurface(id)}
                        className="w-6 h-6 rounded flex items-center justify-center text-muted hover:text-text"
                        title={hidden ? "Show in rail" : "Hide from rail"}
                      >
                        <Icon name={hidden ? "eyeOff" : "eye"} size={13} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </Section>

          <Section title="Share" hint={copied ?? "Make it yours"}>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() =>
                  copyText(shareUrl(appearance))
                    .then(() => flash("Link copied"))
                    .catch(() => flash("Copy failed"))
                }
                className="h-8 rounded-md bg-accent text-white text-[11.5px] font-medium hover:bg-accent-hover flex items-center justify-center gap-1.5"
              >
                <Icon name="link" size={12} /> Share link
              </button>
              <button
                onClick={() =>
                  copyText(JSON.stringify(appearance, null, 2))
                    .then(() => flash("JSON copied"))
                    .catch(() => flash("Copy failed"))
                }
                className="h-8 rounded-md border border-border text-text text-[11.5px] hover:border-border-strong flex items-center justify-center gap-1.5"
              >
                <Icon name="copy" size={12} /> Copy JSON
              </button>
            </div>

            <div className="mt-2 flex items-center justify-between">
              <button
                onClick={() => {
                  setImportOpen((v) => !v);
                  setImportError(null);
                }}
                className="text-[11px] text-muted hover:text-text flex items-center gap-1"
              >
                <Icon name="download" size={11} /> Import a preset
              </button>
              <button
                onClick={() => {
                  app.reset();
                  flash("Reset");
                }}
                className="text-[11px] text-muted hover:text-warning"
              >
                Reset
              </button>
            </div>

            {importOpen && (
              <div className="mt-2.5">
                <textarea
                  value={importText}
                  onChange={(e) => {
                    setImportText(e.target.value);
                    setImportError(null);
                  }}
                  placeholder="Paste a share link, base64, or JSON"
                  rows={3}
                  className="w-full resize-none rounded-md bg-card border border-border focus:border-accent/50 px-2.5 py-2 text-[11px] text-text placeholder:text-muted/60 outline-none font-mono"
                />
                {importError && <p className="mt-1 text-[10.5px] text-danger">{importError}</p>}
                <button
                  onClick={applyImport}
                  disabled={!importText.trim()}
                  className="mt-1.5 h-7 px-3 rounded-md bg-card border border-border text-[11px] text-text hover:border-accent disabled:opacity-40"
                >
                  Apply preset
                </button>
              </div>
            )}
          </Section>
        </div>

        <footer className="px-4 h-10 border-t border-border flex items-center justify-between text-[10px] text-muted/70 shrink-0">
          <span>Saved automatically</span>
          <span className="font-mono">{app.theme} · {app.accent}</span>
        </footer>
      </aside>
    </div>
  );
}
