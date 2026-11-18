import React, { useEffect, useMemo, useState } from "react";
import { connectWs, fetchPullRequests, fetchReviewQueue, fetchThreadRuns } from "../lib/api";
import { sortQueue } from "../components/ReviewQueuePanel";
import { CheckChip } from "../components/CheckStatus";
import { navigate, updateRouteState, useRouteState, type RouteState } from "../lib/hashnav";
import type { PullRequestItem, QueueItem } from "../lib/types";
import { Icon } from "../components/Icon";
import { PullRequestDetailView } from "./PullRequestDetailView";
import { isDesktop, projectDisplayName, switchProject } from "../lib/desktop";

function hasBuild(item: QueueItem): boolean {
  return Boolean(item.branch) && (item.files > 0 || item.additions > 0 || item.deletions > 0);
}

function ago(iso?: string): string {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "just now";
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function ReviewRow({
  item,
  opening,
  onOpen,
}: {
  item: QueueItem;
  opening: string | null;
  onOpen: (item: QueueItem) => void;
}) {
  const built = hasBuild(item);
  const meta = built
    ? `${item.files} file${item.files === 1 ? "" : "s"} · +${item.additions} −${item.deletions}`
    : "No build yet · plan only";
  const reason = built
    ? item.risk.reasons[0]?.detail || "Inspect the changes and their verification evidence."
    : "Nothing has been built for this thread yet. Open the plan to decide the next step.";
  const project = item.project_name || item.project_root
    ? projectDisplayName(item.project_name, item.project_root)
    : "";
  return (
    <section className="review-row" style={{ contentVisibility: "auto", containIntrinsicSize: "auto 90px" }}>
      <button className="review-open" onClick={() => onOpen(item)} disabled={Boolean(opening)}>
        <span className="review-title">
          {project && <span className="review-project-badge">{project}</span>}
          <span>{item.title}</span>
        </span>
        <span className="review-meta">{meta}</span>
        <span className="review-checks"><CheckChip item={item} /></span>
        <span className="review-reason">{reason}</span>
        <span className="review-next">
          {opening === item.card_id ? "Opening…" : built ? "Review changes" : "Open thread"}
          <Icon name="chevR" size={14} />
        </span>
      </button>
      {built && (
        <details>
          <summary>Review priority</summary>
          <p>
            {item.risk.tier} · score {item.risk.score}. A prioritization signal, not a
            correctness guarantee.
          </p>
          {item.risk.reasons.map((reason, index) => (
            <p key={index}>{reason.detail}</p>
          ))}
        </details>
      )}
    </section>
  );
}

function PullRequestRow({
  item,
  onSelect,
}: {
  item: PullRequestItem;
  onSelect: (item: PullRequestItem) => void;
}) {
  const isDraft = item.is_draft || item.title.toLowerCase().startsWith("draft:");
  const isOpen = item.state === "OPEN";
  const isMerged = item.state === "MERGED";
  const stateCls = isDraft
    ? "status-draft"
    : isOpen
    ? "status-open"
    : isMerged
    ? "status-merged"
    : "status-closed";
  const stateLabel = isDraft
    ? "Draft"
    : isOpen
    ? "Open"
    : isMerged
    ? "Merged"
    : "Closed";

  const handleOpenBrowser = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    window.dispatchEvent(new CustomEvent("bark-open-browser", { detail: { url: item.url } }));
  };

  return (
    <article
      className="review-pr-row"
      data-pr-number={item.number}
      onClick={() => onSelect(item)}
      role="button"
      tabIndex={0}
      aria-label={`Inspect pull request #${item.number}: ${item.title}`}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(item);
        }
      }}
    >
      <div className="review-pr-header">
        <div className="review-pr-title-wrap">
          <span className={`review-pr-badge ${stateCls}`}>{stateLabel}</span>
          <span className="review-pr-num">#{item.number}</span>
          <span className="review-pr-title">{item.title}</span>
        </div>
        <div className="review-pr-actions">
          <button
            type="button"
            className="bark-button is-primary"
            onClick={(e) => {
              e.stopPropagation();
              onSelect(item);
            }}
            title="Inspect pull request details, code diff, and timeline"
            aria-label={`Inspect pull request #${item.number}`}
          >
            <Icon name="eye" size={12} />
            <span>Inspect</span>
          </button>
          <button
            type="button"
            className="bark-button"
            onClick={handleOpenBrowser}
            title="Open in Bark's inbuilt browser"
          >
            <Icon name="globe" size={12} />
            <span>Open in Browser</span>
          </button>
          <a
            href={item.url}
            target="_blank"
            rel="noreferrer"
            className="bark-button"
            title="Open repository pull request externally"
            aria-label={`Open PR #${item.number} externally`}
            onClick={(e) => e.stopPropagation()}
          >
            <Icon name="link" size={12} />
          </a>
        </div>
      </div>

      <div className="review-pr-meta">
        <div className="flex items-center gap-1.5">
          <Icon name="branch" size={13} className="text-muted" />
          <span className="review-branch-chip" title={item.head_ref}>{item.head_ref}</span>
          <Icon name="arrowFlat" size={11} className="text-muted" />
          <span className="review-branch-chip" title={item.base_ref}>{item.base_ref}</span>
        </div>

        <div>
          <span className="review-stat-add">+{item.additions}</span>{" "}
          <span className="review-stat-del">−{item.deletions}</span>
          <span> · {item.changed_files} file{item.changed_files === 1 ? "" : "s"}</span>
        </div>

        <span>by @{item.author.login}</span>
        {item.updated_at && <span>updated {ago(item.updated_at)}</span>}

        {item.review_decision && (
          <span className="review-tab-badge">
            {item.review_decision.replace(/_/g, " ").toLowerCase()}
          </span>
        )}
      </div>
    </article>
  );
}

export function ReviewSurface({
  boardName,
  projectRoot,
}: {
  boardName: string | null;
  projectRoot?: string | null;
}) {
  const routeState = useRouteState();
  const selectedPrNumber = routeState.pr ? parseInt(routeState.pr, 10) : null;
  const [selectedPrItem, setSelectedPrItem] = useState<PullRequestItem | null>(null);

  const [items, setItems] = useState<QueueItem[]>([]);
  const [prs, setPrs] = useState<PullRequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [activeTab, setActiveTab] = useState<"all" | "prs" | "ready" | "plans">("all");
  const [prFilter, setPrFilter] = useState<"pending" | "all">("pending");
  const [projectFilter, setProjectFilter] = useState<string>("all");

  const activePrNumber = selectedPrItem
    ? selectedPrItem.number
    : selectedPrNumber && !isNaN(selectedPrNumber)
    ? selectedPrNumber
    : null;
  const activePrItem =
    selectedPrItem ?? (activePrNumber ? prs.find((p) => p.number === activePrNumber) ?? null : null);

  const handleSelectPr = (pr: PullRequestItem) => {
    setSelectedPrItem(pr);
    updateRouteState({ pr: String(pr.number) });
  };

  const handleClosePrDetail = () => {
    setSelectedPrItem(null);
    updateRouteState({ pr: undefined });
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [queueRes, prsRes] = await Promise.allSettled([
          // Review is cross-project: builds waiting in any project Bark has
          // opened show up here, each stamped with its own project.
          fetchReviewQueue(boardName, false, true, true),
          fetchPullRequests("all", 50),
        ]);

        if (cancelled) return;

        if (queueRes.status === "fulfilled") {
          setItems(sortQueue(queueRes.value.items));
          setError(null);
        } else {
          setError("Could not load reviews. Check the server, then retry.");
        }

        if (prsRes.status === "fulfilled") {
          setPrs(prsRes.value);
        }
      } catch {
        if (!cancelled) setError("Could not load reviews. Check the server, then retry.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    const cleanup = connectWs(() => void load());
    return () => {
      cancelled = true;
      cleanup();
    };
  }, [boardName, revision]);

  // A review item opened from another project resumes after the sidecar switch
  // with the exact same target (thread, run, panel).
  useEffect(() => {
    let raw: string | null = null;
    try {
      raw = window.sessionStorage.getItem("bark:review-open");
      if (raw) window.sessionStorage.removeItem("bark:review-open");
    } catch {
      /* storage is optional */
    }
    if (!raw) return;
    try {
      const payload = JSON.parse(raw) as {
        thread?: string;
        run?: string;
        panel?: RouteState["panel"];
        board?: string;
      };
      if (!payload?.thread) return;
      navigate("chat", {
        board: payload.board || undefined,
        thread: payload.thread,
        run: payload.run,
        panel: payload.panel,
      });
    } catch {
      /* ignore a stale target */
    }
  }, []);

  const open = async (item: QueueItem) => {
    if (opening) return;
    setOpening(item.card_id);
    try {
      const runs = await fetchThreadRuns(item.card_id);
      const run = [...runs].reverse().find((run) => run.status !== "merged");
      const targetBoard = item.board || boardName || undefined;
      const panel = hasBuild(item) ? "changes" : "plan";
      const elsewhere = Boolean(
        item.project_root && projectRoot && item.project_root !== projectRoot
      );
      if (elsewhere && isDesktop() && item.project_root) {
        try {
          window.sessionStorage.setItem(
            "bark:review-open",
            JSON.stringify({
              thread: item.card_id,
              run: run?.id,
              panel,
              board: targetBoard,
            })
          );
        } catch {
          /* storage is optional */
        }
        const opened = await switchProject(item.project_root, "review");
        if (!opened) {
          try {
            window.sessionStorage.removeItem("bark:review-open");
          } catch {
            /* storage is optional */
          }
        }
        return;
      }
      navigate("chat", {
        board: targetBoard,
        thread: item.card_id,
        run: run?.id,
        panel,
      });
    } finally {
      setOpening(null);
    }
  };

  const distinctProjects = useMemo(() => {
    const names = new Set<string>();
    for (const item of items) {
      const name = item.project_name || (item.project_root ? projectDisplayName(undefined, item.project_root) : "");
      if (name) names.add(name);
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [items]);

  const filteredItems = useMemo(() => {
    if (projectFilter === "all") return items;
    return items.filter((item) => {
      const name = item.project_name || (item.project_root ? projectDisplayName(undefined, item.project_root) : "");
      return name === projectFilter;
    });
  }, [items, projectFilter]);

  const { ready, plans } = useMemo(() => {
    const ready: QueueItem[] = [];
    const plans: QueueItem[] = [];
    for (const item of filteredItems) (hasBuild(item) ? ready : plans).push(item);
    return { ready, plans };
  }, [filteredItems]);

  const pendingPrs = useMemo(() => {
    return prs.filter((p) => p.state === "OPEN");
  }, [prs]);

  const displayedPrs = useMemo(() => {
    if (prFilter === "pending") {
      // If there are pending/open PRs, show them. If none and user chose pending, return []
      return pendingPrs;
    }
    return prs;
  }, [prFilter, pendingPrs, prs]);

  const hasAnyItems = items.length > 0 || prs.length > 0;

  if (activePrNumber) {
    return (
      <PullRequestDetailView
        prNumber={activePrNumber}
        initialItem={activePrItem}
        onClose={handleClosePrDetail}
      />
    );
  }

  return (
    <div className="review-surface">
      <div className="review-intro">
        <h2>Work that needs your review</h2>
        <p>Built changes with check evidence, repository merge requests, and plan-only threads.</p>
      </div>

      {/* Segmented Filter Pills */}
      <div className="review-tabs" role="tablist" aria-label="Review filter tabs">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "all"}
          className={`review-tab-btn ${activeTab === "all" ? "is-active" : ""}`}
          onClick={() => setActiveTab("all")}
        >
          <span>All</span>
          <span className="review-tab-badge">
            {ready.length + plans.length + (prFilter === "pending" ? pendingPrs.length : prs.length)}
          </span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "prs"}
          className={`review-tab-btn ${activeTab === "prs" ? "is-active" : ""}`}
          onClick={() => setActiveTab("prs")}
        >
          <Icon name="pr" size={13} />
          <span>Merge Requests</span>
          <span className="review-tab-badge">
            {prFilter === "pending" ? pendingPrs.length : prs.length}
          </span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "ready"}
          className={`review-tab-btn ${activeTab === "ready" ? "is-active" : ""}`}
          onClick={() => setActiveTab("ready")}
        >
          <span>Ready to review</span>
          <span className="review-tab-badge">{ready.length}</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "plans"}
          className={`review-tab-btn ${activeTab === "plans" ? "is-active" : ""}`}
          onClick={() => setActiveTab("plans")}
        >
          <span>Plan only</span>
          <span className="review-tab-badge">{plans.length}</span>
        </button>

        {prs.length > 0 && (activeTab === "all" || activeTab === "prs") && (
          <div className="review-subfilter">
            <button
              type="button"
              className={`review-subfilter-btn ${prFilter === "pending" ? "is-active" : ""}`}
              onClick={() => setPrFilter("pending")}
            >
              Pending ({pendingPrs.length})
            </button>
            <button
              type="button"
              className={`review-subfilter-btn ${prFilter === "all" ? "is-active" : ""}`}
              onClick={() => setPrFilter("all")}
            >
              All MRs ({prs.length})
            </button>
          </div>
        )}
      </div>

      {distinctProjects.length > 0 && (
        <div className="review-project-filter flex items-center gap-1.5 text-xs text-muted mb-3">
          <Icon name="folder" size={13} />
          <span>Project:</span>
          <select
            aria-label="Filter reviews by project"
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            className="bark-select bg-surface border border-subtle rounded px-2 py-1 text-xs"
          >
            <option value="all">All projects ({items.length})</option>
            {distinctProjects.map((proj) => (
              <option key={proj} value={proj}>
                {proj}
              </option>
            ))}
          </select>
        </div>
      )}

      {loading ? (
        <p role="status" className="surface-loading">Loading review…</p>
      ) : error ? (
        <div role="alert">
          <p>{error}</p>
          <button className="bark-button mt-3" onClick={() => setRevision((value) => value + 1)}>
            Retry
          </button>
        </div>
      ) : !hasAnyItems ? (
        <div className="review-empty">
          <Icon name="check" size={20} />
          <h3>Nothing to review</h3>
          <p>Finished builds and pending pull requests appear here when they need attention.</p>
          <button className="bark-button" onClick={() => navigate("chat")}>Back to building</button>
        </div>
      ) : (
        <div className="review-list">
          {/* Pull Requests / Merge Requests Section */}
          {(activeTab === "all" || activeTab === "prs") && (
            <section className="review-group" aria-label="Pull Requests">
              <header>
                <h3>Pull Requests / Merge Requests</h3>
                <span>{displayedPrs.length}</span>
              </header>

              {displayedPrs.length > 0 ? (
                displayedPrs.map((pr) => (
                  <PullRequestRow key={pr.number} item={pr} onSelect={handleSelectPr} />
                ))
              ) : prFilter === "pending" && prs.length > 0 ? (
                <div className="review-pr-empty-note">
                  <p>No open pull requests pending in this repo.</p>
                  <button
                    type="button"
                    className="bark-button"
                    onClick={() => setPrFilter("all")}
                  >
                    View all {prs.length} repository MRs
                  </button>
                </div>
              ) : (
                <div className="review-pr-empty-note">
                  <p>No repository pull requests found.</p>
                </div>
              )}
            </section>
          )}

          {/* Ready to review (cards with builds) */}
          {(activeTab === "all" || activeTab === "ready") && ready.length > 0 && (
            <section className="review-group" aria-label="Ready to review">
              <header>
                <h3>Ready to review</h3>
                <span>{ready.length}</span>
              </header>
              {ready.map((item) => (
                <ReviewRow key={item.card_id} item={item} opening={opening} onOpen={(next) => void open(next)} />
              ))}
            </section>
          )}

          {/* Plan only (threads without builds) */}
          {(activeTab === "all" || activeTab === "plans") && plans.length > 0 && (
            <section className="review-group" aria-label="Plan only">
              <header>
                <h3>Plan only</h3>
                <span>{plans.length}</span>
              </header>
              {plans.map((item) => (
                <ReviewRow key={item.card_id} item={item} opening={opening} onOpen={(next) => void open(next)} />
              ))}
            </section>
          )}
        </div>
      )}
    </div>
  );
}
