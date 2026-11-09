import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { DiscoveredSkill, RemoteSkill, SkillPreview, ToolPackage } from "../lib/types";
import {
  fetchDiscoveredSkills,
  importDiscoveredSkill,
  fetchRemoteSkills,
  fetchRemoteSkillPreview,
  importRemoteSkill,
  fetchToolchain,
} from "../lib/api";
import { Icon, type IconName } from "./Icon";

interface SkillSummary {
  id: string;
  name: string;
  description: string;
  triggers: string[];
  source: string;
  enabled: boolean;
}

interface SkillDetail extends SkillSummary {
  content: string;
}

interface InstallResult {
  source: string;
  rev: string;
  installed: string[];
  updated: string[];
}

const SOURCE_META: Record<string, { label: string; tone: string; icon: IconName }> = {
  builtin: { label: "Built in", tone: "text-muted bg-white/[0.04] border-border", icon: "layers" },
  project: { label: "Project", tone: "text-accent-text bg-accent-soft border-accent/25", icon: "code" },
  user: { label: "Personal", tone: "text-[#7db4d6] bg-[#5aa7cf]/10 border-[#5aa7cf]/25", icon: "star" },
};

function sourceMeta(source: string) {
  return SOURCE_META[source] ?? { label: source, tone: "text-muted bg-white/[0.04] border-border", icon: "star" as IconName };
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
  }
  return data as T;
}

function Toggle({
  enabled,
  onClick,
  title,
}: {
  enabled: boolean;
  onClick: (e: React.MouseEvent) => void;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-pressed={enabled}
      className={`relative w-[30px] h-[17px] rounded-full transition-colors shrink-0 ${
        enabled ? "bg-accent" : "bg-white/[0.14]"
      }`}
    >
      <span
        className={`absolute top-[2px] w-[13px] h-[13px] rounded-full bg-white shadow transition-all ${
          enabled ? "left-[15px]" : "left-[2px]"
        }`}
      />
    </button>
  );
}

function ModalShell({
  title,
  subtitle,
  onClose,
  children,
  footer,
  wide,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[55] flex items-start justify-center pt-[9vh] px-4 bg-black/60 backdrop-blur-[2px]"
      onMouseDown={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className={`w-full ${wide ? "max-w-2xl" : "max-w-lg"} bg-surface border border-border rounded-xl shadow-2xl overflow-hidden`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="h-12 px-4 flex items-center gap-2 border-b border-border">
          <div className="min-w-0">
            <h2 className="text-[13px] font-medium text-text">{title}</h2>
            {subtitle && <p className="text-[10px] text-muted truncate">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="ml-auto w-7 h-7 rounded-md flex items-center justify-center text-muted hover:text-text hover:bg-white/[0.05]"
            title="Close"
          >
            <Icon name="x" size={14} />
          </button>
        </header>
        <div className="p-4">{children}</div>
        {footer && <footer className="px-4 py-3 border-t border-border flex items-center justify-end gap-2">{footer}</footer>}
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between mb-1">
        <span className="text-[10px] uppercase tracking-[0.12em] text-muted-strong">{label}</span>
        {hint && <span className="text-[9.5px] text-muted/70">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

const fieldCls =
  "w-full bg-card border border-border rounded-md px-2.5 py-2 text-[12px] text-text placeholder:text-muted/50 outline-none focus:border-accent/70 transition-colors";

function CreateSkillModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (skill: SkillDetail) => void;
}) {
  const [name, setName] = useState("");
  const [id, setId] = useState("");
  const [description, setDescription] = useState("");
  const [triggers, setTriggers] = useState("");
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!name.trim() || !content.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ skill: SkillDetail }>("/api/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: id.trim() || undefined,
          name,
          description,
          triggers: triggers.split(",").map((t) => t.trim()).filter(Boolean),
          content,
        }),
      });
      onCreated(res.skill);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell
      title="New skill"
      subtitle="A markdown playbook agents can follow"
      onClose={onClose}
      wide
      footer={
        <>
          <button onClick={onClose} className="h-8 px-3 rounded-md border border-border text-[11.5px] text-muted hover:text-text">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!name.trim() || !content.trim() || busy}
            className="h-8 px-3.5 rounded-md bg-accent text-white text-[11.5px] font-medium hover:bg-accent-hover disabled:opacity-40"
          >
            {busy ? "Creating…" : "Create skill"}
          </button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Name">
          <input value={name} onChange={(e) => setName(e.target.value)} className={fieldCls} placeholder="Release captain" autoFocus />
        </Field>
        <Field label="Id" hint="optional">
          <input value={id} onChange={(e) => setId(e.target.value)} className={fieldCls} placeholder="release-captain" />
        </Field>
      </div>
      <div className="mt-3">
        <Field label="Description">
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={fieldCls}
            placeholder="What it does, in one line"
          />
        </Field>
      </div>
      <div className="mt-3">
        <Field label="Triggers" hint="comma separated">
          <input
            value={triggers}
            onChange={(e) => setTriggers(e.target.value)}
            className={fieldCls}
            placeholder="release, changelog, ship"
          />
        </Field>
      </div>
      <div className="mt-3">
        <Field label="Playbook">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={9}
            className={`${fieldCls} resize-none font-mono leading-relaxed`}
            placeholder={"## When to use\n…\n\n## Steps\n1. …\n2. …\n\n## Done when\n…"}
          />
        </Field>
      </div>
      {error && <p className="mt-2 text-[11px] text-danger">{error}</p>}
      <p className="mt-2 text-[10px] text-muted/70">
        Saved to <span className="font-mono">.board/skills/</span>. New skills start enabled.
      </p>
    </ModalShell>
  );
}

function InstallSkillModal({
  onClose,
  onInstalled,
}: {
  onClose: () => void;
  onInstalled: () => void;
}) {
  const [source, setSource] = useState("");
  const [dir, setDir] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<InstallResult | null>(null);

  const submit = async () => {
    if (!source.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api<InstallResult>("/api/skills/install", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source, dir: dir.trim() || undefined }),
      });
      setResult(res);
      onInstalled();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell
      title="Install skills"
      subtitle="GitHub repo, git URL, or a local directory"
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className="h-8 px-3 rounded-md border border-border text-[11.5px] text-muted hover:text-text">
            {result ? "Done" : "Cancel"}
          </button>
          <button
            onClick={submit}
            disabled={!source.trim() || busy}
            className="h-8 px-3.5 rounded-md bg-accent text-white text-[11.5px] font-medium hover:bg-accent-hover disabled:opacity-40 flex items-center gap-1.5"
          >
            <Icon name="download" size={12} />
            {busy ? "Installing…" : "Install"}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Source" hint="owner/repo, URL, or path">
          <input
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className={fieldCls}
            placeholder="acme/agent-skills"
            autoFocus
            disabled={Boolean(result)}
          />
        </Field>
        <Field label="Subdirectory" hint="optional">
          <input
            value={dir}
            onChange={(e) => setDir(e.target.value)}
            className={fieldCls}
            placeholder="skills/"
            disabled={Boolean(result)}
          />
        </Field>
      </div>

      {error && <p className="mt-3 text-[11px] text-danger">{error}</p>}

      {result && (
        <div className="mt-3 rounded-lg border border-border bg-card p-3">
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-success/15 text-success flex items-center justify-center">
              <Icon name="check" size={11} />
            </span>
            <span className="text-[12px] text-text">Installed from {result.source}</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {result.installed.map((id) => (
              <span key={id} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-accent-soft text-accent-text">
                + {id}
              </span>
            ))}
            {result.updated.map((id) => (
              <span key={id} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-warning/10 text-warning">
                ~ {id}
              </span>
            ))}
            {result.installed.length === 0 && result.updated.length === 0 && (
              <span className="text-[10.5px] text-muted">No new files; pins refreshed at {result.rev.slice(0, 7)}.</span>
            )}
          </div>
        </div>
      )}

      <p className="mt-3 text-[10px] text-muted/70">
        Markdown with frontmatter is picked up. Installs are pinned in <span className="font-mono">skills.lock</span>.
      </p>
    </ModalShell>
  );
}

function DiscoverSkillsModal({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: () => void;
}) {
  const [skills, setSkills] = useState<DiscoveredSkill[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [imported, setImported] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;
    fetchDiscoveredSkills()
      .then((next) => {
        if (alive) setSkills(next);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const importSkill = async (skill: DiscoveredSkill) => {
    if (busyId || skill.already_installed) return;
    setBusyId(skill.path);
    setError(null);
    try {
      const result = await importDiscoveredSkill(skill.path);
      if (!result) throw new Error("Import failed");
      setImported((prev) => [...prev, result.id]);
      setSkills((prev) =>
        prev.map((item) =>
          item.path === skill.path ? { ...item, already_installed: true } : item
        )
      );
      onImported();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <ModalShell
      title="Discover skills"
      subtitle="Claude, OpenCode, and project markdown"
      onClose={onClose}
      wide
      footer={
        <button
          onClick={onClose}
          className="h-8 px-3 rounded-md border border-border text-[11.5px] text-muted hover:text-text"
        >
          Done
        </button>
      }
    >
      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((row) => (
            <div key={row} className="h-12 animate-pulse rounded-md bg-surface/70" />
          ))}
        </div>
      ) : skills.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-4 py-6 text-center">
          <p className="text-[12px] text-muted">No skill files found.</p>
          <p className="mt-1 text-[10.5px] leading-relaxed text-muted/60">
            Looked in <span className="font-mono">.board/skills</span>,{" "}
            <span className="font-mono">skills</span>,{" "}
            <span className="font-mono">.claude/skills</span>,{" "}
            <span className="font-mono">.opencode/skills</span>, and personal agent folders.
          </p>
        </div>
      ) : (
        <div className="max-h-[50vh] overflow-auto divide-y divide-border/60 border-y border-border/60">
          {skills.map((skill) => (
            <div key={skill.path} className="flex items-start gap-3 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[12px] font-medium text-text">{skill.name}</span>
                  <span className="font-mono text-[8.5px] uppercase text-muted/50">
                    {skill.source}
                  </span>
                  {skill.always && (
                    <span className="rounded bg-accent-soft px-1 py-0.5 font-mono text-[8px] text-accent-text">
                      always
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-[10.5px] leading-relaxed text-muted">
                  {skill.description || "No description"}
                </p>
                <div className="mt-1 truncate font-mono text-[8.5px] text-muted/45">
                  {skill.path}
                </div>
                {skill.triggers.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {skill.triggers.slice(0, 6).map((trigger) => (
                      <span
                        key={trigger}
                        className="rounded border border-border/70 px-1 py-0.5 font-mono text-[8px] text-muted/70"
                      >
                        {trigger}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => importSkill(skill)}
                disabled={skill.already_installed || busyId === skill.path}
                className="h-7 shrink-0 rounded-md border border-border px-2.5 text-[10.5px] text-muted transition-colors hover:border-border-strong hover:text-text disabled:opacity-40"
              >
                {skill.already_installed || imported.includes(skill.id)
                  ? "Imported"
                  : busyId === skill.path
                    ? "Importing…"
                    : "Import"}
              </button>
            </div>
          ))}
        </div>
      )}
      {error && <p className="mt-3 text-[11px] text-danger">{error}</p>}
      <p className="mt-3 text-[10px] text-muted/70">
        Imports are copied into <span className="font-mono">.board/skills/</span> and start enabled.
      </p>
    </ModalShell>
  );
}

function RemoteSkillModal({
  skillId,
  onClose,
  onImported,
}: {
  skillId: string;
  onClose: () => void;
  onImported: (id: string) => void;
}) {
  const [preview, setPreview] = useState<SkillPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchRemoteSkillPreview(skillId)
      .then((data) => {
        if (alive) setPreview(data);
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [skillId]);

  const handleImport = async () => {
    if (!preview) return;
    setImporting(true);
    setError(null);
    try {
      await importRemoteSkill(preview.skill.id);
      onImported(preview.skill.id);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setImporting(false);
    }
  };

  return (
    <ModalShell
      title={preview ? preview.skill.name : "Skill Details"}
      subtitle={preview ? `From skills.sh by @${preview.skill.author}` : "Loading preview…"}
      onClose={onClose}
      wide
      footer={
        <div className="flex items-center justify-between w-full">
          {preview ? (
            <a
              href={preview.skill.repository}
              target="_blank"
              rel="noreferrer"
              className="text-[11px] text-accent hover:underline flex items-center gap-1 font-mono"
            >
              <Icon name="code" size={12} /> View source repo
            </a>
          ) : <div />}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-8 px-3 rounded-md border border-border text-[11px] text-muted hover:text-text"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleImport}
              disabled={loading || importing || !preview}
              className="h-8 px-3 rounded-md bg-accent text-white text-[11px] font-medium hover:bg-accent-hover disabled:opacity-40 flex items-center gap-1.5"
            >
              <Icon name="download" size={12} /> {importing ? "Importing…" : "Import to Project"}
            </button>
          </div>
        </div>
      }
    >
      {loading ? (
        <div className="py-12 text-center text-[12px] text-muted">Loading preview & running safety scan…</div>
      ) : error ? (
        <div className="py-6 text-center text-[12px] text-danger">{error}</div>
      ) : preview ? (
        <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
          {/* Metadata Bar */}
          <div className="flex flex-wrap items-center gap-2 pb-2 border-b border-border text-[11px]">
            <span className="px-2 py-0.5 rounded bg-accent-soft text-accent-text font-mono text-[10px]">
              {preview.skill.category}
            </span>
            <span className="px-2 py-0.5 rounded border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 font-mono text-[10px]">
              License: {preview.skill.license}
            </span>
            <span className="text-muted">Author: @{preview.skill.author}</span>
          </div>

          {/* Safety Audit Card */}
          <div
            className={`p-3 rounded-lg border text-[11px] ${
              preview.safety.is_clean
                ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-400"
                : "bg-amber-500/10 border-amber-500/30 text-amber-300"
            }`}
          >
            <div className="flex items-center gap-2 font-medium">
              <Icon name={preview.safety.is_clean ? "check" : "warn"} size={13} />
              <span>
                {preview.safety.is_clean
                  ? "Security Verified: No executable shell scripts or credentials detected."
                  : "Safety Warnings (Review before importing):"}
              </span>
            </div>
            {!preview.safety.is_clean && preview.safety.warnings.length > 0 && (
              <ul className="mt-2 list-disc list-inside space-y-1 text-[10.5px] opacity-90">
                {preview.safety.warnings.map((w, idx) => (
                  <li key={idx}>{w}</li>
                ))}
              </ul>
            )}
          </div>

          <p className="text-[12px] text-text leading-relaxed">{preview.skill.description}</p>

          {/* Markdown Content */}
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <div className="h-7 px-3 flex items-center gap-2 border-b border-border/70 text-[10px] text-muted font-mono bg-white/[0.02]">
              <Icon name="doc" size={11} />
              SKILL.md
            </div>
            <pre className="p-3 text-[11px] font-mono leading-relaxed text-muted-strong whitespace-pre-wrap max-h-[30vh] overflow-y-auto">
              {preview.skill.content}
            </pre>
          </div>
        </div>
      ) : null}
    </ModalShell>
  );
}

export function SkillsView() {
  const [viewTab, setViewTab] = useState<"installed" | "skills_sh" | "toolchain">("installed");
  const [skills, setSkills] = useState<SkillSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "on" | "off">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SkillDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [installOpen, setInstallOpen] = useState(false);
  const [discoverOpen, setDiscoverOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // skills.sh remote state
  const [remoteSkills, setRemoteSkills] = useState<RemoteSkill[]>([]);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [remoteCategory, setRemoteCategory] = useState<string>("all");
  const [selectedRemoteId, setSelectedRemoteId] = useState<string | null>(null);

  // Toolchain state
  const [toolchainPackages, setToolchainPackages] = useState<ToolPackage[]>([]);
  const [toolchainLoading, setToolchainLoading] = useState(false);
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);

  const loadRemote = useCallback(async () => {
    setRemoteLoading(true);
    try {
      const cat = remoteCategory === "all" ? undefined : remoteCategory;
      const data = await fetchRemoteSkills(query, cat);
      setRemoteSkills(data);
    } finally {
      setRemoteLoading(false);
    }
  }, [query, remoteCategory]);

  const loadToolchain = useCallback(async () => {
    setToolchainLoading(true);
    try {
      const data = await fetchToolchain();
      setToolchainPackages(data);
    } finally {
      setToolchainLoading(false);
    }
  }, []);

  useEffect(() => {
    if (viewTab === "skills_sh") {
      loadRemote();
    } else if (viewTab === "toolchain") {
      loadToolchain();
    }
  }, [viewTab, loadRemote, loadToolchain]);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await api<{ skills: SkillSummary[] }>("/api/skills");
      setSkills(data.skills);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Detail is fetched on demand so list rendering never pulls 10 full prompts.
  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    let alive = true;
    setDetailLoading(true);
    setConfirmDelete(false);
    api<SkillDetail>(`/api/skills/${encodeURIComponent(selectedId)}`)
      .then((data) => {
        if (alive) setDetail(data);
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (alive) setDetailLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [selectedId]);

  const enabledCount = skills.filter((s) => s.enabled).length;
  const projectCount = skills.filter((s) => s.source === "project").length;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return skills
      .filter((s) => {
        if (filter === "on" && !s.enabled) return false;
        if (filter === "off" && s.enabled) return false;
        if (!q) return true;
        return `${s.name} ${s.id} ${s.description} ${s.triggers.join(" ")}`.toLowerCase().includes(q);
      })
      .sort((a, b) => Number(b.enabled) - Number(a.enabled) || a.name.localeCompare(b.name));
  }, [skills, query, filter]);

  const toggle = async (skill: SkillSummary) => {
    const next = !skill.enabled;
    setSkills((prev) => prev.map((s) => (s.id === skill.id ? { ...s, enabled: next } : s)));
    setDetail((prev) => (prev && prev.id === skill.id ? { ...prev, enabled: next } : prev));
    try {
      await api(`/api/skills/${encodeURIComponent(skill.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      setNotice(next ? `${skill.name} is available to agents` : `${skill.name} is off`);
      window.setTimeout(() => setNotice(null), 2200);
    } catch (e) {
      setSkills((prev) => prev.map((s) => (s.id === skill.id ? { ...s, enabled: skill.enabled } : s)));
      setDetail((prev) => (prev && prev.id === skill.id ? { ...prev, enabled: skill.enabled } : prev));
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const remove = async (skill: SkillDetail) => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    try {
      await api(`/api/skills/${encodeURIComponent(skill.id)}`, { method: "DELETE" });
      setSelectedId(null);
      setDetail(null);
      setNotice(`Deleted ${skill.name}`);
      window.setTimeout(() => setNotice(null), 2200);
      load(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const copyMarkdown = async (skill: SkillDetail) => {
    const markdown = `---\nid: ${skill.id}\nname: ${skill.name}\ndescription: ${skill.description}\ntriggers: [${skill.triggers.join(", ")}]\n---\n\n${skill.content}`;
    try {
      await navigator.clipboard.writeText(markdown);
      setNotice("Markdown copied");
      window.setTimeout(() => setNotice(null), 1800);
    } catch {
      setError("Could not copy to the clipboard");
    }
  };

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="px-4 pt-4 pb-3 border-b border-border/70 shrink-0 space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <h2 className="text-[15px] font-medium text-text">Skills & Toolchain</h2>
              {viewTab === "installed" && (
                <span className="flex items-center gap-1.5 text-[10px] font-mono text-muted">
                  <span className={`w-1.5 h-1.5 rounded-full ${enabledCount > 0 ? "bg-success" : "bg-muted"}`} />
                  {enabledCount} on
                  <span className="text-border-strong">/</span>
                  {skills.length}
                </span>
              )}
            </div>
            <p className="text-[11px] text-muted mt-1">
              {viewTab === "installed" && "Enabled skills ride along with matching agent tasks."}
              {viewTab === "skills_sh" && "Explore and 1-click import open agent skills from skills.sh with safety scanning."}
              {viewTab === "toolchain" && "Manage external CLI agents & harnesses: fx, deepsec, and agent-browser."}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap shrink-0 ml-auto">
            {viewTab !== "toolchain" && (
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted/70 pointer-events-none">
                  <Icon name="search" size={12} />
                </span>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={viewTab === "skills_sh" ? "Search skills.sh…" : "Search skills…"}
                  className="h-8 w-[190px] bg-card border border-border rounded-md pl-7 pr-2.5 text-[11.5px] text-text placeholder:text-muted/60 outline-none focus:border-accent/60"
                />
              </div>
            )}
            {viewTab === "installed" && (
              <>
                <button
                  onClick={() => setDiscoverOpen(true)}
                  className="h-8 px-3 rounded-md border border-border text-[11.5px] text-muted hover:text-text hover:border-border-strong flex items-center gap-1.5 transition-colors"
                >
                  <Icon name="search" size={12} /> Discover
                </button>
                <button
                  onClick={() => setInstallOpen(true)}
                  className="h-8 px-3 rounded-md border border-border text-[11.5px] text-muted hover:text-text hover:border-border-strong flex items-center gap-1.5 transition-colors"
                >
                  <Icon name="download" size={12} /> Install
                </button>
                <button
                  onClick={() => setCreateOpen(true)}
                  className="h-8 px-3 rounded-md bg-accent text-white text-[11.5px] font-medium hover:bg-accent-hover flex items-center gap-1.5"
                >
                  <Icon name="plus" size={12} /> New skill
                </button>
              </>
            )}
            {viewTab === "skills_sh" && (
              <button
                type="button"
                onClick={loadRemote}
                className="h-8 px-3 rounded-md border border-border text-[11.5px] text-muted hover:text-text hover:border-border-strong flex items-center gap-1.5 transition-colors"
              >
                <Icon name="spark" size={12} /> Refresh
              </button>
            )}
            {viewTab === "toolchain" && (
              <button
                type="button"
                onClick={loadToolchain}
                className="h-8 px-3 rounded-md border border-border text-[11.5px] text-muted hover:text-text hover:border-border-strong flex items-center gap-1.5 transition-colors"
              >
                <Icon name="spark" size={12} /> Re-scan PATH
              </button>
            )}
          </div>
        </div>

        {/* Subsystem Tab Navigation: fixed left-aligned position */}
        <div className="flex items-center gap-1 p-0.5 bg-card border border-border rounded-lg w-fit">
          <button
            type="button"
            onClick={() => setViewTab("installed")}
            className={`h-7 px-2.5 rounded-md text-[11px] font-medium transition-all ${
              viewTab === "installed" ? "bg-accent text-white shadow-sm" : "text-muted hover:text-text hover:bg-white/[0.04]"
            }`}
          >
            Installed ({skills.length})
          </button>
          <button
            type="button"
            onClick={() => setViewTab("skills_sh")}
            className={`h-7 px-2.5 rounded-md text-[11px] font-medium transition-all flex items-center gap-1.5 ${
              viewTab === "skills_sh" ? "bg-accent text-white shadow-sm" : "text-muted hover:text-text hover:bg-white/[0.04]"
            }`}
          >
            <Icon name="layers" size={11} />
            skills.sh Library
          </button>
          <button
            type="button"
            onClick={() => setViewTab("toolchain")}
            className={`h-7 px-2.5 rounded-md text-[11px] font-medium transition-all flex items-center gap-1.5 ${
              viewTab === "toolchain" ? "bg-accent text-white shadow-sm" : "text-muted hover:text-text hover:bg-white/[0.04]"
            }`}
          >
            <Icon name="terminal" size={11} />
            Tools & Agents
          </button>
        </div>
      </div>

      <div className="h-9 px-4 flex items-center gap-1 border-b border-border/70 shrink-0">
        {viewTab === "installed" ? (
          (
            [
              { id: "all", label: "All", n: skills.length },
              { id: "on", label: "Active", n: enabledCount },
              { id: "off", label: "Off", n: skills.length - enabledCount },
            ] as const
          ).map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`h-6 px-2 rounded-md text-[11px] transition-colors ${
                filter === f.id ? "bg-accent-soft text-accent-text" : "text-muted hover:text-text"
              }`}
            >
              {f.label}
              <span className="ml-1 text-[9.5px] font-mono opacity-60">{f.n}</span>
            </button>
          ))
        ) : viewTab === "skills_sh" ? (
          ["all", "testing", "security", "frontend", "workflow", "backend"].map((cat) => (
            <button
              key={cat}
              onClick={() => setRemoteCategory(cat)}
              className={`h-6 px-2.5 rounded-md text-[11px] capitalize transition-colors ${
                remoteCategory === cat ? "bg-accent-soft text-accent-text font-medium" : "text-muted hover:text-text"
              }`}
            >
              {cat}
            </button>
          ))
        ) : (
          <span className="text-[11px] text-muted">
            Standardized coding agents and security harnesses for worktrees
          </span>
        )}
        {(notice || error) && (
          <div className="ml-auto flex items-center gap-2 min-w-0">
            <span className={`text-[10.5px] truncate ${error ? "text-danger" : "text-success"}`}>{error ?? notice}</span>
            <button
              onClick={() => {
                setError(null);
                setNotice(null);
              }}
              className="text-muted hover:text-text"
            >
              <Icon name="x" size={10} />
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {viewTab === "installed" ? (
          loading ? (
            <div className="p-4 grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-[118px] rounded-lg bg-card border border-border animate-pulse" />
              ))}
            </div>
          ) : visible.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center gap-3 text-center px-6">
              <span className="w-12 h-12 rounded-full bg-accent-soft text-accent-text flex items-center justify-center">
                <Icon name="star" size={22} />
              </span>
              <div>
                <p className="text-[13px] text-text">{skills.length === 0 ? "No skills yet" : "Nothing matches"}</p>
                <p className="text-[11px] text-muted mt-1">
                  {skills.length === 0
                    ? "Install a pack, or write a playbook your agents can follow."
                    : "Try a different search or filter."}
                </p>
              </div>
              {skills.length === 0 && (
                <div className="flex gap-2">
                  <button
                    onClick={() => setInstallOpen(true)}
                    className="h-8 px-3 rounded-md border border-border text-[11.5px] text-text hover:border-accent"
                  >
                    Install skills
                  </button>
                  <button
                    onClick={() => setCreateOpen(true)}
                    className="h-8 px-3 rounded-md bg-accent text-white text-[11.5px] hover:bg-accent-hover"
                  >
                    Write one
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="p-4 grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-3">
              {visible.map((s) => {
                const meta = sourceMeta(s.source);
                return (
                  <div
                    key={s.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedId(s.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelectedId(s.id);
                      }
                    }}
                    className={`group text-left rounded-lg border p-3 flex flex-col gap-2 cursor-pointer transition-all outline-none focus-visible:ring-1 focus-visible:ring-accent ${
                      s.enabled
                        ? "bg-card border-border hover:border-border-strong"
                        : "bg-card/40 border-border/60 opacity-60 hover:opacity-80"
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      <span
                        className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${
                          s.enabled ? "bg-accent-soft text-accent-text" : "bg-white/[0.04] text-muted"
                        }`}
                      >
                        <Icon name={meta.icon} size={14} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[12.5px] font-medium text-text truncate">{s.name}</span>
                        </div>
                        <span className="text-[9.5px] font-mono text-muted/70">{s.id}</span>
                      </div>
                      <Toggle
                        enabled={s.enabled}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggle(s);
                        }}
                        title={s.enabled ? "Disable for agents" : "Enable for agents"}
                      />
                    </div>

                    <p
                      className="text-[11px] text-muted leading-relaxed overflow-hidden"
                      style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}
                    >
                      {s.description || "No description"}
                    </p>

                    <div className="flex flex-wrap items-center gap-1 mt-auto">
                      <span className={`text-[9px] px-1.5 py-[2px] rounded border ${meta.tone}`}>{meta.label}</span>
                      {s.triggers.slice(0, 3).map((t) => (
                        <span key={t} className="text-[9.5px] font-mono px-1.5 py-[2px] rounded bg-white/[0.04] text-muted">
                          {t}
                        </span>
                      ))}
                      {s.triggers.length > 3 && (
                        <span className="text-[9.5px] font-mono text-muted/60">+{s.triggers.length - 3}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : viewTab === "skills_sh" ? (
          remoteLoading ? (
            <div className="p-4 grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-[140px] rounded-lg bg-card border border-border animate-pulse" />
              ))}
            </div>
          ) : remoteSkills.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center gap-3 text-center px-6">
              <span className="w-12 h-12 rounded-full bg-accent-soft text-accent-text flex items-center justify-center">
                <Icon name="search" size={22} />
              </span>
              <p className="text-[13px] text-text">No skills found in skills.sh catalog</p>
              <p className="text-[11px] text-muted">Try a different search query or select 'All'.</p>
            </div>
          ) : (
            <div className="p-4 grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-3">
              {remoteSkills.map((s) => (
                <div
                  key={s.id}
                  className="p-3.5 rounded-lg border border-border bg-card hover:border-accent/60 transition-colors flex flex-col text-left justify-between"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="text-[13px] font-medium text-text truncate">{s.name}</h3>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] font-mono text-muted">{s.id}</span>
                          <span className="text-[9.5px] text-accent">@{s.author}</span>
                        </div>
                      </div>
                      <span className="text-[9px] px-1.5 py-[1px] rounded border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 font-mono">
                        {s.license}
                      </span>
                    </div>

                    <p className="text-[11px] text-muted line-clamp-2 mt-2 leading-relaxed">{s.description}</p>
                  </div>

                  <div className="mt-3 pt-2 border-t border-border/60 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-[9.5px]">
                      {s.safety?.is_clean ? (
                        <span className="text-emerald-400 flex items-center gap-1">
                          <Icon name="check" size={10} /> Clean
                        </span>
                      ) : (
                        <span className="text-amber-400 flex items-center gap-1">
                          <Icon name="warn" size={10} /> Has Scripts
                        </span>
                      )}
                      <span className="text-border">·</span>
                      <span className="font-mono text-muted">{s.category}</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => setSelectedRemoteId(s.id)}
                      className="h-6 px-2.5 rounded-md bg-accent/15 border border-accent/30 text-accent text-[10.5px] font-medium hover:bg-accent hover:text-white transition-all flex items-center gap-1"
                    >
                      <Icon name="eye" size={10} /> Inspect & Add
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
          /* Toolchain & Packages View */
          <div className="p-4 space-y-4 max-w-5xl">
            <div className="p-3.5 rounded-lg border border-border bg-card text-[12px] leading-relaxed text-muted flex items-start gap-3">
              <span className="w-7 h-7 rounded-md bg-accent-soft text-accent-text flex items-center justify-center shrink-0 mt-0.5">
                <Icon name="terminal" size={14} />
              </span>
              <div>
                <span className="font-medium text-text">Agent Toolchain & CLIs</span>
                <p className="mt-0.5 text-[11px]">
                  barkcli orchestrates tasks across independent worktrees. These third-party CLIs give agents specialized runtime abilities:
                  minimal Unix execution with <strong>fx</strong>, pre-merge vulnerability scans with <strong>deepsec</strong>, and headless UI verification with <strong>agent-browser</strong>.
                </p>
              </div>
            </div>

            {toolchainLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-44 rounded-lg bg-card border border-border animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {toolchainPackages.map((pkg) => (
                  <div key={pkg.id} className="p-4 rounded-lg border border-border bg-card flex flex-col justify-between">
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="text-[14px] font-semibold text-text">{pkg.name}</h3>
                          <span className="text-[9.5px] font-mono px-1.5 py-0.5 rounded bg-accent-soft text-accent-text">
                            {pkg.role === "AgentRunner"
                              ? "Agent Backend"
                              : pkg.role === "SecurityGate"
                              ? "Security Gate"
                              : "Browser Automation"}
                          </span>
                        </div>

                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full font-medium flex items-center gap-1 ${
                            pkg.installed
                              ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                              : "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${pkg.installed ? "bg-emerald-400" : "bg-amber-400"}`} />
                          {pkg.installed ? "Installed" : "Not Found"}
                        </span>
                      </div>

                      <p className="text-[11px] text-muted mt-2.5 leading-relaxed">{pkg.description}</p>

                      <div className="mt-3 pt-2 border-t border-border/70 space-y-1 text-[10.5px]">
                        <div className="flex items-center justify-between text-muted">
                          <span>License:</span>
                          <span className="font-mono text-text">{pkg.license} ({pkg.author})</span>
                        </div>
                        {pkg.version && (
                          <div className="flex items-center justify-between text-muted">
                            <span>Version:</span>
                            <span className="font-mono text-text">{pkg.version}</span>
                          </div>
                        )}
                        {pkg.binary_path && (
                          <div className="truncate text-muted/60 font-mono text-[9px] mt-1">
                            {pkg.binary_path}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-border">
                      <span className="text-[10px] uppercase tracking-wider text-muted font-medium">Install Command:</span>
                      <div className="mt-1 flex items-center gap-1 bg-black/40 border border-border rounded px-2 py-1">
                        <code className="text-[10px] font-mono text-text truncate flex-1">{pkg.install_command}</code>
                        <button
                          type="button"
                          onClick={async () => {
                            await navigator.clipboard.writeText(pkg.install_command);
                            setCopiedCmd(pkg.id);
                            window.setTimeout(() => setCopiedCmd(null), 1500);
                          }}
                          className="text-muted hover:text-text shrink-0"
                          title="Copy install command"
                        >
                          <Icon name={copiedCmd === pkg.id ? "check" : "copy"} size={11} />
                        </button>
                      </div>

                      <div className="mt-2 text-right">
                        <a
                          href={pkg.doc_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[10px] text-accent hover:underline inline-flex items-center gap-1 font-mono"
                        >
                          Documentation <Icon name="link" size={9} />
                        </a>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Detail sheet */}
      {selectedId && (
        <div
          className="fixed inset-0 z-[54] flex justify-end bg-black/50 backdrop-blur-[2px]"
          onMouseDown={() => setSelectedId(null)}
          role="dialog"
          aria-label="Skill detail"
        >
          <aside
            className="h-full w-[460px] max-w-[94vw] bg-surface border-l border-border shadow-2xl flex flex-col"
            onMouseDown={(e) => e.stopPropagation()}
          >
            {detailLoading || !detail ? (
              <div className="flex-1 flex items-center justify-center text-[12px] text-muted">Loading skill…</div>
            ) : (
              <>
                <header className="px-4 pt-4 pb-3 border-b border-border">
                  <div className="flex items-start gap-2.5">
                    <span className="w-8 h-8 rounded-md bg-accent-soft text-accent-text flex items-center justify-center shrink-0">
                      <Icon name={sourceMeta(detail.source).icon} size={15} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <h2 className="text-[14px] font-medium text-text truncate">{detail.name}</h2>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] font-mono text-muted">{detail.id}</span>
                        <span className={`text-[9px] px-1.5 py-[1px] rounded border ${sourceMeta(detail.source).tone}`}>
                          {sourceMeta(detail.source).label}
                        </span>
                      </div>
                    </div>
                    <Toggle
                      enabled={detail.enabled}
                      onClick={() => toggle(detail)}
                      title={detail.enabled ? "Disable for agents" : "Enable for agents"}
                    />
                    <button
                      onClick={() => setSelectedId(null)}
                      className="w-7 h-7 rounded-md flex items-center justify-center text-muted hover:text-text hover:bg-white/[0.05]"
                      title="Close"
                    >
                      <Icon name="x" size={14} />
                    </button>
                  </div>
                  <p className="text-[11.5px] text-muted mt-3 leading-relaxed">
                    {detail.description || "No description"}
                  </p>
                  {detail.triggers.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {detail.triggers.map((t) => (
                        <span key={t} className="text-[10px] font-mono px-1.5 py-[2px] rounded bg-white/[0.04] text-muted-strong">
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="mt-3 flex items-center gap-1.5 text-[10.5px]">
                    <span className={`w-1.5 h-1.5 rounded-full ${detail.enabled ? "bg-success" : "bg-muted"}`} />
                    <span className={detail.enabled ? "text-success" : "text-muted"}>
                      {detail.enabled ? "Available to agents" : "Off — never injected"}
                    </span>
                  </div>
                </header>

                <div className="flex-1 overflow-y-auto p-4">
                  <div className="rounded-lg border border-border bg-card overflow-hidden">
                    <div className="h-8 px-3 flex items-center gap-2 border-b border-border/70 text-[10px] text-muted font-mono">
                      <Icon name="doc" size={11} />
                      playbook.md
                    </div>
                    <pre className="p-3 text-[11px] leading-relaxed text-muted-strong whitespace-pre-wrap font-mono max-h-[52vh] overflow-y-auto">
                      {detail.content}
                    </pre>
                  </div>
                </div>

                <footer className="px-4 py-3 border-t border-border flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => copyMarkdown(detail)}
                    className="h-8 px-3 rounded-md border border-border text-[11px] text-text hover:border-border-strong flex items-center gap-1.5"
                  >
                    <Icon name="copy" size={11} /> Copy markdown
                  </button>
                  {detail.source === "project" && (
                    <button
                      onClick={() => remove(detail)}
                      onMouseLeave={() => setConfirmDelete(false)}
                      className={`ml-auto h-8 px-3 rounded-md text-[11px] flex items-center gap-1.5 border transition-colors ${
                        confirmDelete
                          ? "bg-danger/15 border-danger/40 text-danger"
                          : "border-border text-muted hover:text-danger hover:border-danger/40"
                      }`}
                    >
                      <Icon name="trash" size={11} /> {confirmDelete ? "Confirm delete" : "Delete"}
                    </button>
                  )}
                </footer>
              </>
            )}
          </aside>
        </div>
      )}

      {createOpen && (
        <CreateSkillModal
          onClose={() => setCreateOpen(false)}
          onCreated={(skill) => {
            setCreateOpen(false);
            setSkills((prev) => [...prev.filter((s) => s.id !== skill.id), skill]);
            setSelectedId(skill.id);
            setDetail(skill);
            setNotice(`${skill.name} created`);
            window.setTimeout(() => setNotice(null), 2200);
          }}
        />
      )}

      {discoverOpen && (
        <DiscoverSkillsModal
          onClose={() => {
            setDiscoverOpen(false);
            load(true);
          }}
          onImported={() => load(true)}
        />
      )}

      {installOpen && (
        <InstallSkillModal
          onClose={() => setInstallOpen(false)}
          onInstalled={() => load(true)}
        />
      )}

      {selectedRemoteId && (
        <RemoteSkillModal
          skillId={selectedRemoteId}
          onClose={() => setSelectedRemoteId(null)}
          onImported={(id) => {
            setNotice(`Skill '${id}' imported to project`);
            window.setTimeout(() => setNotice(null), 2500);
            load(true);
            setViewTab("installed");
          }}
        />
      )}
    </div>
  );
}
