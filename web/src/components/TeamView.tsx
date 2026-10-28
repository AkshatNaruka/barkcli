import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "./Icon";
import type {
  AgentProfile,
  OrchestraSnapshot,
  ProfileStatus,
  RoleDef,
} from "../lib/types";
import {
  fetchAgentProfiles,
  fetchOrchestra,
  fetchRoles,
  hireDefaultTeam,
  saveAgentProfile,
  setProfileStatus,
} from "../lib/api";

const PROVIDERS = ["opencode", "claude-code", "codex", "human"];
const PERMISSION_MODES = ["supervised", "auto", "read-only"];

function statusClass(status: ProfileStatus) {
  if (status === "active") return "text-success";
  if (status === "paused") return "text-warning";
  return "text-muted";
}

function statusDot(status: ProfileStatus) {
  if (status === "active") return "bg-success";
  if (status === "paused") return "bg-warning";
  return "bg-muted";
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function roleLabel(roles: RoleDef[], id: string) {
  return roles.find((role) => role.id === id)?.name || id;
}

function emptyProfile(role: string): AgentProfile {
  return {
    id: "",
    name: "",
    role,
    provider: "opencode",
    capacity: 1,
    permission_mode: "supervised",
    skills: [],
    memory_scope: "project",
    status: "active",
    prompt: "",
  };
}

export function TeamView({ boardName }: { boardName: string | null }) {
  const [profiles, setProfiles] = useState<AgentProfile[]>([]);
  const [roles, setRoles] = useState<RoleDef[]>([]);
  const [snapshot, setSnapshot] = useState<OrchestraSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<AgentProfile | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (initial = false) => {
    if (initial) setLoading(true);
    const [nextProfiles, nextRoles, nextSnapshot] = await Promise.all([
      fetchAgentProfiles(),
      fetchRoles(),
      fetchOrchestra(false),
    ]);
    setProfiles(nextProfiles);
    setRoles(nextRoles);
    setSnapshot(nextSnapshot);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load(true);
  }, [load, boardName]);

  const members = useMemo(() => {
    const byId = new Map(
      (snapshot?.team || []).map((member) => [member.profile.id, member])
    );
    return profiles.map((profile) => ({
      profile,
      load: byId.get(profile.id)?.load ?? 0,
      successRate: byId.get(profile.id)?.success_rate ?? 0,
      activeTaskIds: byId.get(profile.id)?.active_task_ids ?? [],
    }));
  }, [profiles, snapshot]);

  const activeCount = profiles.filter((profile) => profile.status === "active").length;

  const hireDefault = async () => {
    setSaving(true);
    setError(null);
    const hired = await hireDefaultTeam();
    setSaving(false);
    if (!hired) {
      setError("The default team could not be hired. Check that .board is writable.");
      return;
    }
    await load();
  };

  const save = async () => {
    if (!editing) return;
    if (!editing.name.trim()) {
      setError("Give this agent a name.");
      return;
    }
    setSaving(true);
    setError(null);
    const saved = await saveAgentProfile({
      ...editing,
      capacity: Math.max(1, Math.min(8, editing.capacity || 1)),
    });
    setSaving(false);
    if (!saved) {
      setError("The agent profile could not be saved.");
      return;
    }
    setEditing(null);
    await load();
  };

  const changeStatus = async (profile: AgentProfile, status: ProfileStatus) => {
    setError(null);
    const saved = await setProfileStatus(profile.id, status);
    if (!saved) {
      setError(`Could not set ${profile.name} to ${status}.`);
      return;
    }
    await load();
  };

  if (loading) {
    return (
      <div className="h-full grid place-items-center text-[12px] text-muted">
        Loading team…
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-[1080px] mx-auto px-5 py-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-[17px] font-medium tracking-tight text-text">Team</h2>
              <span className="text-[10px] uppercase tracking-[0.12em] text-muted">
                {activeCount} active · {profiles.length} hired
              </span>
            </div>
            <p className="mt-1 max-w-[620px] text-[12px] leading-relaxed text-muted">
              Roles are policies. Agents are profiles with a provider, capacity, and a
              system prompt. Plans recommend agents; you can always override the pick.
            </p>
          </div>
          <button
            onClick={() => setEditing(emptyProfile(roles[0]?.id || "builder"))}
            className="inline-flex items-center gap-1.5 rounded-md border border-border-strong bg-card px-2.5 py-1.5 text-[11.5px] text-text hover:bg-white/[0.04]"
          >
            <Icon name="plus" size={13} />
            Hire agent
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-[11.5px] text-danger">
            {error}
          </div>
        )}

        {profiles.length === 0 ? (
          <div className="mt-6 rounded-lg border border-border bg-card/60 px-6 py-10 text-center">
            <div className="mx-auto grid h-10 w-10 place-items-center rounded-full border border-border bg-surface text-accent-text">
              <Icon name="users" size={18} />
            </div>
            <h3 className="mt-3 text-[14px] font-medium text-text">Hire your first team</h3>
            <p className="mx-auto mt-1 max-w-[420px] text-[12px] leading-relaxed text-muted">
              Product Owner, two Builders, and a Reviewer. Each agent is a Markdown
              profile you can edit, pause, or retire at any time.
            </p>
            <button
              onClick={() => void hireDefault()}
              disabled={saving}
              className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-[11.5px] font-medium text-white hover:bg-accent-hover disabled:opacity-50"
            >
              <Icon name="spark" size={13} />
              {saving ? "Hiring…" : "Hire default team"}
            </button>
          </div>
        ) : (
          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {members.map(({ profile, load, successRate, activeTaskIds }) => (
              <div
                key={profile.id}
                className="group rounded-lg border border-border bg-card/55 p-3.5 hover:border-border-strong transition-colors"
              >
                <div className="flex items-start gap-2.5">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border bg-surface text-[11px] font-medium text-accent-text">
                    {initials(profile.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-[12.5px] font-medium text-text">
                        {profile.name}
                      </span>
                      <span className={`h-1.5 w-1.5 rounded-full ${statusDot(profile.status)}`} />
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-muted">
                      <span>{roleLabel(roles, profile.role)}</span>
                      <span className="text-border-strong">·</span>
                      <span className={statusClass(profile.status)}>{profile.status}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => setEditing({ ...profile, skills: [...profile.skills] })}
                    className="opacity-0 group-hover:opacity-100 rounded p-1 text-muted hover:text-text hover:bg-white/[0.05]"
                    title="Edit profile"
                  >
                    <Icon name="pencil" size={12} />
                  </button>
                </div>

                <div className="mt-3 flex items-center justify-between text-[10.5px]">
                  <span className="rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-[9.5px] text-muted">
                    {profile.provider}
                    {profile.model ? ` · ${profile.model}` : ""}
                  </span>
                  <span className="text-muted">
                    {profile.permission_mode}
                  </span>
                </div>

                <div className="mt-3">
                  <div className="flex items-center justify-between text-[10px] text-muted">
                    <span>Load</span>
                    <span className="font-mono">
                      {load}/{profile.capacity}
                    </span>
                  </div>
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/[0.06]">
                    <div
                      className={`h-full rounded-full ${
                        load >= profile.capacity ? "bg-warning" : "bg-accent"
                      }`}
                      style={{
                        width: `${Math.min(100, (load / Math.max(1, profile.capacity)) * 100)}%`,
                      }}
                    />
                  </div>
                </div>

                <div className="mt-2.5 flex items-center justify-between text-[10px] text-muted">
                  <span>
                    {activeTaskIds.length > 0
                      ? `${activeTaskIds.length} live task${activeTaskIds.length === 1 ? "" : "s"}`
                      : "No live tasks"}
                  </span>
                  <span>
                    {successRate > 0 ? `${Math.round(successRate * 100)}% success` : "New"}
                  </span>
                </div>

                {profile.skills.length > 0 && (
                  <div className="mt-2.5 flex flex-wrap gap-1">
                    {profile.skills.slice(0, 4).map((skill) => (
                      <span
                        key={skill}
                        className="rounded bg-white/[0.04] px-1.5 py-0.5 text-[9.5px] text-muted-strong"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                )}

                <div className="mt-3 flex items-center gap-1 border-t border-border/70 pt-2.5">
                  {profile.status === "active" ? (
                    <button
                      onClick={() => void changeStatus(profile, "paused")}
                      className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-[10.5px] text-muted hover:text-text hover:bg-white/[0.04]"
                    >
                      <Icon name="stop" size={10} /> Pause
                    </button>
                  ) : profile.status === "paused" ? (
                    <button
                      onClick={() => void changeStatus(profile, "active")}
                      className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-[10.5px] text-success hover:bg-success-soft"
                    >
                      <Icon name="check" size={10} /> Resume
                    </button>
                  ) : null}
                  {profile.status !== "retired" && (
                    <button
                      onClick={() => void changeStatus(profile, "retired")}
                      className="ml-auto inline-flex items-center gap-1 rounded px-1.5 py-1 text-[10.5px] text-muted hover:text-danger hover:bg-danger-soft"
                    >
                      Retire
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-7">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-[13px] font-medium text-text">Role library</h3>
              <p className="mt-0.5 text-[11px] text-muted">
                Role contracts define outputs and stop conditions. Project roles can
                override built-ins from <span className="font-mono">.board/roles</span>.
              </p>
            </div>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {roles.map((role) => (
              <div key={role.id} className="rounded-md border border-border bg-card/40 px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-[11.5px] font-medium text-text">{role.name}</span>
                  {role.writes_code && (
                    <span className="rounded bg-accent-soft px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-accent-text">
                      writes code
                    </span>
                  )}
                  {!role.builtin && (
                    <span className="rounded bg-white/[0.05] px-1.5 py-0.5 text-[9px] text-muted">
                      project
                    </span>
                  )}
                </div>
                <p className="mt-1 text-[10.5px] leading-relaxed text-muted">{role.mission}</p>
                <div className="mt-1.5 text-[9.5px] text-muted">
                  Stops: {role.stop_condition || "—"}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 px-4">
          <div className="w-full max-w-[560px] rounded-lg border border-border-strong bg-panel shadow-2xl">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div>
                <h3 className="text-[13px] font-medium text-text">
                  {profiles.some((profile) => profile.id === editing.id)
                    ? "Edit agent"
                    : "Hire agent"}
                </h3>
                <p className="text-[10.5px] text-muted">
                  Profiles are stored as Markdown in <span className="font-mono">.board/agents</span>.
                </p>
              </div>
              <button
                onClick={() => setEditing(null)}
                className="rounded p-1 text-muted hover:text-text hover:bg-white/[0.05]"
              >
                <Icon name="x" size={14} />
              </button>
            </div>
            <div className="max-h-[70vh] overflow-y-auto px-4 py-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-[10px] uppercase tracking-wide text-muted">Name</span>
                  <input
                    value={editing.name}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                    className="mt-1 w-full rounded border border-border bg-surface px-2 py-1.5 text-[12px] text-text outline-none focus:border-accent"
                    placeholder="Builder One"
                  />
                </label>
                <label className="block">
                  <span className="text-[10px] uppercase tracking-wide text-muted">Role</span>
                  <select
                    value={editing.role}
                    onChange={(e) => setEditing({ ...editing, role: e.target.value })}
                    className="mt-1 w-full rounded border border-border bg-surface px-2 py-1.5 text-[12px] text-text outline-none focus:border-accent"
                  >
                    {roles.map((role) => (
                      <option key={role.id} value={role.id}>
                        {role.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-[10px] uppercase tracking-wide text-muted">Provider</span>
                  <select
                    value={editing.provider}
                    onChange={(e) => setEditing({ ...editing, provider: e.target.value })}
                    className="mt-1 w-full rounded border border-border bg-surface px-2 py-1.5 text-[12px] text-text outline-none focus:border-accent"
                  >
                    {PROVIDERS.map((provider) => (
                      <option key={provider} value={provider}>
                        {provider}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-[10px] uppercase tracking-wide text-muted">Model</span>
                  <input
                    value={editing.model || ""}
                    onChange={(e) => setEditing({ ...editing, model: e.target.value || undefined })}
                    className="mt-1 w-full rounded border border-border bg-surface px-2 py-1.5 text-[12px] text-text outline-none focus:border-accent"
                    placeholder="provider default"
                  />
                </label>
                <label className="block">
                  <span className="text-[10px] uppercase tracking-wide text-muted">Capacity</span>
                  <input
                    type="number"
                    min={1}
                    max={8}
                    value={editing.capacity}
                    onChange={(e) =>
                      setEditing({ ...editing, capacity: Number(e.target.value) || 1 })
                    }
                    className="mt-1 w-full rounded border border-border bg-surface px-2 py-1.5 text-[12px] text-text outline-none focus:border-accent"
                  />
                </label>
                <label className="block">
                  <span className="text-[10px] uppercase tracking-wide text-muted">Permissions</span>
                  <select
                    value={editing.permission_mode}
                    onChange={(e) =>
                      setEditing({ ...editing, permission_mode: e.target.value })
                    }
                    className="mt-1 w-full rounded border border-border bg-surface px-2 py-1.5 text-[12px] text-text outline-none focus:border-accent"
                  >
                    {PERMISSION_MODES.map((mode) => (
                      <option key={mode} value={mode}>
                        {mode}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block sm:col-span-2">
                  <span className="text-[10px] uppercase tracking-wide text-muted">
                    Skills (comma separated)
                  </span>
                  <input
                    value={editing.skills.join(", ")}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        skills: e.target.value
                          .split(",")
                          .map((value) => value.trim())
                          .filter(Boolean),
                      })
                    }
                    className="mt-1 w-full rounded border border-border bg-surface px-2 py-1.5 text-[12px] text-text outline-none focus:border-accent"
                    placeholder="implementation, testing"
                  />
                </label>
                <label className="block sm:col-span-2">
                  <span className="text-[10px] uppercase tracking-wide text-muted">
                    System prompt
                  </span>
                  <textarea
                    value={editing.prompt || ""}
                    onChange={(e) => setEditing({ ...editing, prompt: e.target.value })}
                    rows={5}
                    className="mt-1 w-full resize-y rounded border border-border bg-surface px-2 py-1.5 text-[11.5px] leading-relaxed text-text outline-none focus:border-accent"
                    placeholder="The role prompt is used when this field is empty."
                  />
                </label>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
              <button
                onClick={() => setEditing(null)}
                className="rounded px-2.5 py-1.5 text-[11.5px] text-muted hover:text-text hover:bg-white/[0.04]"
              >
                Cancel
              </button>
              <button
                onClick={() => void save()}
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded bg-accent px-3 py-1.5 text-[11.5px] font-medium text-white hover:bg-accent-hover disabled:opacity-50"
              >
                <Icon name="check" size={12} />
                {saving ? "Saving…" : "Save agent"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
