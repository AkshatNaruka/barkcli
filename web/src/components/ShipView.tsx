import { useEffect, useMemo, useState } from "react";
import type {
  Board,
  EditorDetection,
  GitStatus,
  RepoEntry,
  RepoFile,
  WorktreeInfo,
} from "../lib/types";
import {
  detectEditors,
  fetchGitCommits,
  fetchGitStatus,
  fetchRepoFile,
  fetchRepoTree,
  fetchWorktrees,
  gitCommit,
  gitCreatePr,
  gitMerge,
  gitPush,
  openInEditor,
  type GitCommit as GitCommitRecord,
} from "../lib/api";
import { Icon } from "./Icon";

function changePath(path: string): string {
  return path.includes(" -> ") ? path.split(" -> ").pop() || path : path;
}

function statusTone(status: string): string {
  if (status.includes("A") || status.includes("?")) return "text-success";
  if (status.includes("D")) return "text-danger";
  if (status.includes("R")) return "text-accent-text";
  return "text-warning";
}

export function ShipView({
  board,
  boardName,
}: {
  board: Board | null;
  boardName: string | null;
}) {
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [tree, setTree] = useState<RepoEntry[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [file, setFile] = useState<RepoFile | null>(null);
  const [loadingFile, setLoadingFile] = useState(false);
  const [editors, setEditors] = useState<EditorDetection | null>(null);
  const [editorId, setEditorId] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [allChanges, setAllChanges] = useState(true);
  const [message, setMessage] = useState("");
  const [cardId, setCardId] = useState("");
  const [base, setBase] = useState("main");
  const [prTitle, setPrTitle] = useState("");
  const [prBody, setPrBody] = useState("");
  const [prDraft, setPrDraft] = useState(false);
  const [mergeBranch, setMergeBranch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [commits, setCommits] = useState<GitCommitRecord[]>([]);
  const [worktrees, setWorktrees] = useState<WorktreeInfo[]>([]);

  const refresh = async () => {
    const [nextStatus, nextTree, nextEditors, nextWorktrees] = await Promise.all([
      fetchGitStatus(),
      fetchRepoTree(".", 4),
      detectEditors(),
      fetchWorktrees(),
    ]);
    if (nextStatus) {
      setStatus(nextStatus);
      setSelectedPaths((current) => {
        const valid = new Set(nextStatus.changes.map((change) => changePath(change.path)));
        if (current.size === 0) return valid;
        return new Set([...current].filter((path) => valid.has(path)));
      });
      setMergeBranch((current) => current || nextStatus.branch);
      void fetchGitCommits(nextStatus.branch, 8)
        .then((response) => setCommits(response.commits || []))
        .catch(() => setCommits([]));
    }
    if (nextTree) setTree(nextTree.entries);
    if (nextWorktrees) setWorktrees(nextWorktrees);
    if (nextEditors) {
      setEditors(nextEditors);
      setEditorId(
        (current) =>
          current ||
          nextEditors.preferred ||
          nextEditors.editors.find((editor) => editor.available)?.id ||
          ""
      );
    }
  };

  useEffect(() => {
    void refresh();
    // The branch and working tree are intentionally refreshed from the shell,
    // not on every board edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardName]);

  const loadFile = async (path: string) => {
    setSelected(path);
    setLoadingFile(true);
    setFile(null);
    const next = await fetchRepoFile(path);
    setFile(next);
    setLoadingFile(false);
  };

  const visibleTree = useMemo(() => {
    const collapsedPaths = [...collapsed];
    return tree
      .filter(
        (entry) =>
          !collapsedPaths.some(
            (dir) => entry.path === dir || entry.path.startsWith(`${dir}/`)
          )
      )
      .slice(0, 600);
  }, [tree, collapsed]);

  const run = async (label: string, action: () => Promise<boolean | string>) => {
    setBusy(label);
    setError(null);
    setNotice(null);
    try {
      const result = await action();
      if (typeof result === "string") {
        setNotice(result);
      } else if (result) {
        setNotice("Done.");
      } else {
        setError(`${label} failed. Check the server log for details.`);
      }
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(null);
    }
  };

  const commit = () =>
    run("Commit", async () => {
      if (!message.trim()) throw new Error("Write a commit message first.");
      const paths = allChanges ? [] : [...selectedPaths];
      if (!allChanges && paths.length === 0) {
        throw new Error("Select at least one changed file.");
      }
      const confirmed = window.confirm(
        `Commit ${allChanges ? "all working tree changes" : `${paths.length} selected files`}?\n\n${message.trim()}`
      );
      if (!confirmed) return "Cancelled.";
      const result = await gitCommit(message.trim(), paths, cardId || undefined);
      if (!result) return false;
      setMessage("");
      return `Committed ${result.sha} (${result.files.length} files).`;
    });

  const push = () =>
    run("Push", async () => {
      if (!status) return false;
      const confirmed = window.confirm(
        `Push ${status.branch} to ${status.upstream || "origin"}?\n\nThis publishes the branch to the remote.`
      );
      if (!confirmed) return "Cancelled.";
      const result = await gitPush({ confirm: true });
      if (!result) return false;
      return `Pushed ${result.branch} to ${result.remote}.`;
    });

  const previewPr = () =>
    run("Preview PR", async () => {
      if (!prTitle.trim()) throw new Error("Add a pull request title first.");
      const result = await gitCreatePr({
        title: prTitle.trim(),
        body: prBody,
        base,
        draft: prDraft,
        dryRun: true,
      });
      if (!result) return false;
      return `Preview: ${result.output}`;
    });

  const createPr = () =>
    run("Create PR", async () => {
      if (!prTitle.trim()) throw new Error("Add a pull request title first.");
      const confirmed = window.confirm(
        `Create a pull request from ${status?.branch || "this branch"} into ${base}?`
      );
      if (!confirmed) return "Cancelled.";
      const result = await gitCreatePr({
        title: prTitle.trim(),
        body: prBody,
        base,
        draft: prDraft,
        confirm: true,
      });
      if (!result) return false;
      return result.output || "Pull request created.";
    });

  const merge = () =>
    run("Merge", async () => {
      if (!mergeBranch.trim()) throw new Error("Choose a branch to merge.");
      const confirmed = window.confirm(
        `Merge ${mergeBranch} into ${status?.branch || "the current branch"}?\n\nThis changes the working branch.`
      );
      if (!confirmed) return "Cancelled.";
      const result = await gitMerge(mergeBranch.trim(), undefined, true);
      if (!result) return false;
      return `Merged ${mergeBranch} into ${status?.branch || "the current branch"}.`;
    });

  const openSelected = async () => {
    if (!selected) return;
    const result = await openInEditor(selected, 1, undefined, editorId || undefined);
    if (!result?.opened) setError("No supported editor was found.");
    else setNotice(`Opened ${selected}.`);
  };

  const changedPaths = status?.changes || [];
  const cards = board?.cards || [];

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-[1600px] space-y-4 p-4">
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2">
          <span className="flex h-6 w-6 items-center justify-center rounded bg-accent-soft text-accent-text">
            <Icon name="branch" size={12} />
          </span>
          <span className="font-mono text-[11px] text-text">
            {status?.branch || "no branch"}
          </span>
          {status?.head && (
            <span className="font-mono text-[9.5px] text-muted/60">{status.head}</span>
          )}
          {status?.upstream && (
            <span className="font-mono text-[9px] text-muted/50">
              ↑{status.ahead} ↓{status.behind}
            </span>
          )}
          <span
            className={`rounded px-1.5 py-0.5 font-mono text-[9px] ${
              status?.clean
                ? "bg-success-soft text-success"
                : "bg-warning-soft text-warning"
            }`}
          >
            {status?.clean ? "clean" : `${changedPaths.length} changed`}
          </span>
          <span className="ml-auto flex items-center gap-2">
            {editors && (
              <select
                value={editorId}
                onChange={(event) => setEditorId(event.target.value)}
                className="rounded border border-border bg-card px-1.5 py-1 text-[10px] text-text outline-none"
                aria-label="Preferred editor"
              >
                <option value="">Auto editor</option>
                {editors.editors
                  .filter((editor) => editor.available)
                  .map((editor) => (
                    <option key={editor.id} value={editor.id}>
                      {editor.name}
                    </option>
                  ))}
              </select>
            )}
            <button
              type="button"
              onClick={() => void refresh()}
              className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-[10px] text-muted hover:text-text"
            >
              <Icon name="refresh" size={9} /> Refresh
            </button>
          </span>
        </div>

        {worktrees.length > 1 && (
          <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2">
            <span className="text-[9px] uppercase tracking-wide text-muted/60">
              Worktrees
            </span>
            {worktrees.map((worktree) => (
              <span
                key={worktree.path}
                className="inline-flex items-center gap-1 rounded border border-border/70 bg-card px-1.5 py-0.5 font-mono text-[9px] text-muted"
                title={worktree.path}
              >
                <Icon name="branch" size={8} />
                {worktree.branch || (worktree.detached ? "detached" : "HEAD")}
                <span className="text-muted/40">
                  {worktree.path.split("/").filter(Boolean).pop()}
                </span>
              </span>
            ))}
          </div>
        )}

        {(notice || error) && (
          <div
            className={`flex items-start gap-2 rounded border px-3 py-2 text-[10.5px] ${
              error
                ? "border-danger/30 bg-danger-soft text-danger"
                : "border-success/25 bg-success-soft text-success"
            }`}
          >
            <span className="min-w-0 flex-1 whitespace-pre-wrap">{error || notice}</span>
            <button
              type="button"
              onClick={() => {
                setError(null);
                setNotice(null);
              }}
              className="text-muted hover:text-text"
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        )}

        <div className="grid items-start gap-4 md:grid-cols-[240px_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,1fr)_380px]">
          <section className="rounded-lg border border-border bg-surface">
            <div className="flex items-center gap-2 border-b border-border px-3 py-2">
              <Icon name="layers" size={11} className="text-muted" />
              <span className="text-[11px] font-medium text-text">Repository</span>
              <span className="ml-auto font-mono text-[9px] text-muted/50">
                {tree.length} entries
              </span>
            </div>
            <div className="max-h-[540px] overflow-auto py-1">
              {visibleTree.map((entry) => {
                const depth = entry.path.split("/").length - 1;
                const isCollapsed = collapsed.has(entry.path);
                return (
                  <button
                    key={entry.path}
                    type="button"
                    onClick={() => {
                      if (entry.kind === "dir") {
                        setCollapsed((current) => {
                          const next = new Set(current);
                          if (next.has(entry.path)) next.delete(entry.path);
                          else next.add(entry.path);
                          return next;
                        });
                      } else {
                        void loadFile(entry.path);
                      }
                    }}
                    className={`flex w-full items-center gap-1.5 py-1 pr-2 text-left text-[10.5px] hover:bg-white/[0.04] ${
                      selected === entry.path ? "bg-accent-soft text-accent-text" : "text-muted"
                    }`}
                    style={{ paddingLeft: `${8 + depth * 12}px` }}
                    title={entry.path}
                  >
                    <Icon
                      name={entry.kind === "dir" ? (isCollapsed ? "chevR" : "arrowDown") : "doc"}
                      size={9}
                      className="shrink-0 text-muted/55"
                    />
                    <span className="truncate">{entry.name}</span>
                    {entry.kind === "file" && entry.size != null && (
                      <span className="ml-auto shrink-0 font-mono text-[8px] text-muted/35">
                        {entry.size > 1024
                          ? `${Math.round(entry.size / 1024)}k`
                          : `${entry.size}b`}
                      </span>
                    )}
                  </button>
                );
              })}
              {visibleTree.length === 0 && (
                <p className="px-3 py-8 text-center text-[10.5px] text-muted">
                  No files loaded. Refresh the repository.
                </p>
              )}
            </div>
          </section>

          <section className="min-w-0 rounded-lg border border-border bg-surface">
            <div className="flex items-center gap-2 border-b border-border px-3 py-2">
              <Icon name="code" size={11} className="text-muted" />
              <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-text">
                {selected || "Select a file"}
              </span>
              {selected && (
                <button
                  type="button"
                  onClick={() => void openSelected()}
                  className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-[10px] text-muted hover:text-text"
                >
                  <Icon name="code" size={9} /> Open in editor
                </button>
              )}
            </div>
            <div className="max-h-[540px] min-h-[280px] overflow-auto">
              {loadingFile ? (
                <div className="space-y-2 p-3">
                  {[0, 1, 2, 3, 4, 5].map((row) => (
                    <div key={row} className="h-4 animate-pulse rounded bg-surface/70" />
                  ))}
                </div>
              ) : file ? (
                file.binary ? (
                  <p className="p-4 text-[11px] text-muted">Binary file · {file.bytes} bytes</p>
                ) : (
                  <div className="min-w-max py-2 font-mono text-[10.5px] leading-[1.6]">
                    {file.content.split("\n").map((line, index) => (
                      <div key={index} className="flex hover:bg-white/[0.03]">
                        <span className="w-10 shrink-0 select-none pr-2 text-right text-[9px] text-muted/35">
                          {index + 1}
                        </span>
                        <code className="whitespace-pre pr-4 text-text">
                          {line || "\u00a0"}
                        </code>
                      </div>
                    ))}
                  </div>
                )
              ) : (
                <div className="p-10 text-center text-[11px] leading-relaxed text-muted">
                  Pick a file from the repository tree.
                  <br />
                  Reviewed line comments live in the Chat Diff tab.
                </div>
              )}
            </div>
            {file?.truncated && (
              <div className="border-t border-border/60 px-3 py-1.5 text-[9px] text-warning">
                Preview truncated at 200 KB. Open the file in your editor to read the rest.
              </div>
            )}
          </section>

          <section className="space-y-4 md:col-span-2 xl:col-span-1">
            <div className="rounded-lg border border-border bg-surface">
              <div className="flex items-center gap-2 border-b border-border px-3 py-2">
                <Icon name="branch" size={11} className="text-muted" />
                <span className="text-[11px] font-medium text-text">Commit</span>
                <span className="ml-auto font-mono text-[9px] text-muted/50">
                  {status?.clean ? "nothing to commit" : `${changedPaths.length} changed`}
                </span>
              </div>
              <div className="space-y-2 p-3">
                <div className="flex items-center gap-2 text-[10px] text-muted">
                  <input
                    id="ship-all"
                    type="checkbox"
                    checked={allChanges}
                    onChange={(event) => setAllChanges(event.target.checked)}
                  />
                  <label htmlFor="ship-all">All working tree changes</label>
                  <label className="ml-auto flex items-center gap-1 text-[9.5px]">
                    Card
                    <select
                      value={cardId}
                      onChange={(event) => setCardId(event.target.value)}
                      className="max-w-[110px] rounded border border-border bg-card px-1 py-0.5 text-[9.5px] text-text"
                    >
                      <option value="">none</option>
                      {cards.map((card) => (
                        <option key={card.id} value={card.id}>
                          {card.title}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                {!allChanges && (
                  <div className="max-h-28 overflow-auto rounded border border-border/60">
                    {changedPaths.map((change) => {
                      const path = changePath(change.path);
                      return (
                        <label
                          key={`${change.status}:${change.path}`}
                          className="flex items-center gap-2 px-2 py-1 text-[10px] text-muted hover:bg-white/[0.03]"
                        >
                          <input
                            type="checkbox"
                            checked={selectedPaths.has(path)}
                            onChange={(event) =>
                              setSelectedPaths((current) => {
                                const next = new Set(current);
                                if (event.target.checked) next.add(path);
                                else next.delete(path);
                                return next;
                              })
                            }
                          />
                          <span className={`w-3 font-mono ${statusTone(change.status)}`}>
                            {change.status || "M"}
                          </span>
                          <span className="truncate font-mono">{path}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
                {allChanges && changedPaths.length > 0 && (
                  <div className="max-h-28 space-y-0.5 overflow-auto">
                    {changedPaths.slice(0, 20).map((change) => (
                      <button
                        key={`${change.status}:${change.path}`}
                        type="button"
                        onClick={() => void loadFile(changePath(change.path))}
                        className="flex w-full items-center gap-2 rounded px-1 py-0.5 text-left text-[10px] text-muted hover:bg-white/[0.04]"
                      >
                        <span className={`w-3 font-mono ${statusTone(change.status)}`}>
                          {change.status || "M"}
                        </span>
                        <span className="truncate font-mono">{changePath(change.path)}</span>
                      </button>
                    ))}
                  </div>
                )}
                <input
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  placeholder="Commit message"
                  className="w-full rounded border border-border bg-bg px-2 py-1.5 text-[10.5px] text-text outline-none focus:border-accent/60"
                />
                <button
                  type="button"
                  onClick={() => void commit()}
                  disabled={Boolean(busy) || Boolean(status?.clean)}
                  className="inline-flex w-full items-center justify-center gap-1 rounded bg-accent px-2 py-1.5 text-[10.5px] font-medium text-white hover:bg-accent-hover disabled:opacity-40"
                >
                  <Icon name="check" size={10} />
                  {busy === "Commit" ? "Committing…" : "Commit"}
                </button>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-surface">
              <div className="flex items-center gap-2 border-b border-border px-3 py-2">
                <Icon name="branch" size={11} className="text-muted" />
                <span className="text-[11px] font-medium text-text">Ship</span>
              </div>
              <div className="space-y-2 p-3">
                <button
                  type="button"
                  onClick={() => void push()}
                  disabled={Boolean(busy)}
                  className="inline-flex w-full items-center justify-center gap-1 rounded border border-border px-2 py-1.5 text-[10.5px] text-text hover:bg-white/[0.04] disabled:opacity-40"
                >
                  <Icon name="branch" size={10} />
                  {busy === "Push" ? "Pushing…" : `Push ${status?.branch || "branch"}`}
                </button>

                {status?.upstream && (
                  <p className="text-[9px] text-muted/55">
                    Upstream: <span className="font-mono">{status.upstream}</span>
                    {status.ahead > 0 && ` · ${status.ahead} ahead`}
                    {status.behind > 0 && ` · ${status.behind} behind`}
                  </p>
                )}

                <div className="border-t border-border/60 pt-2">
                  <div className="text-[9px] uppercase tracking-wide text-muted/60">
                    Pull request
                  </div>
                  <input
                    value={prTitle}
                    onChange={(event) => setPrTitle(event.target.value)}
                    placeholder="Title"
                    className="mt-1 w-full rounded border border-border bg-bg px-2 py-1 text-[10px] text-text outline-none focus:border-accent/60"
                  />
                  <textarea
                    value={prBody}
                    onChange={(event) => setPrBody(event.target.value)}
                    rows={2}
                    placeholder="Body"
                    className="mt-1 w-full resize-y rounded border border-border bg-bg px-2 py-1 text-[10px] text-text outline-none focus:border-accent/60"
                  />
                  <div className="mt-1 flex items-center gap-1.5">
                    <input
                      value={base}
                      onChange={(event) => setBase(event.target.value)}
                      className="w-20 rounded border border-border bg-bg px-1.5 py-1 text-[10px] text-text"
                      aria-label="Base branch"
                    />
                    <label className="flex items-center gap-1 text-[9.5px] text-muted">
                      <input
                        type="checkbox"
                        checked={prDraft}
                        onChange={(event) => setPrDraft(event.target.checked)}
                      />
                      draft
                    </label>
                    <button
                      type="button"
                      onClick={() => void previewPr()}
                      disabled={Boolean(busy)}
                      className="ml-auto rounded border border-border px-1.5 py-1 text-[9.5px] text-muted hover:text-text disabled:opacity-40"
                    >
                      Preview
                    </button>
                    <button
                      type="button"
                      onClick={() => void createPr()}
                      disabled={Boolean(busy)}
                      className="rounded bg-accent px-1.5 py-1 text-[9.5px] font-medium text-white hover:bg-accent-hover disabled:opacity-40"
                    >
                      Create
                    </button>
                  </div>
                </div>

                <div className="border-t border-border/60 pt-2">
                  <div className="text-[9px] uppercase tracking-wide text-muted/60">
                    Merge branch
                  </div>
                  <div className="mt-1 flex items-center gap-1.5">
                    <input
                      value={mergeBranch}
                      onChange={(event) => setMergeBranch(event.target.value)}
                      placeholder="feature/…"
                      className="min-w-0 flex-1 rounded border border-border bg-bg px-2 py-1 font-mono text-[10px] text-text outline-none focus:border-accent/60"
                    />
                    <button
                      type="button"
                      onClick={() => void merge()}
                      disabled={Boolean(busy)}
                      className="rounded border border-danger/30 bg-danger-soft px-1.5 py-1 text-[9.5px] text-danger hover:brightness-110 disabled:opacity-40"
                    >
                      Merge
                    </button>
                  </div>
                  <p className="mt-1 text-[9px] leading-relaxed text-muted/55">
                    Requires a clean working tree. Run merges stay human-approved in the
                    Chat review.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-surface">
              <div className="flex items-center gap-2 border-b border-border px-3 py-2">
                <Icon name="history" size={11} className="text-muted" />
                <span className="text-[11px] font-medium text-text">Recent commits</span>
              </div>
              <div className="space-y-1 p-2">
                {commits.length === 0 && (
                  <p className="px-1 py-2 text-[10px] text-muted">No commits on this branch.</p>
                )}
                {commits.map((commit) => (
                  <div
                    key={commit.sha}
                    className="flex items-start gap-2 rounded px-1 py-1 hover:bg-white/[0.03]"
                  >
                    <span className="mt-0.5 font-mono text-[9px] text-accent-text">
                      {commit.sha.slice(0, 7)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[10px] text-text">
                      {commit.subject}
                    </span>
                    <span className="shrink-0 font-mono text-[8.5px] text-muted/45">
                      {commit.author}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
