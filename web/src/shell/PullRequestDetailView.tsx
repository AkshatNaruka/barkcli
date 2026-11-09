import React, { useEffect, useState } from "react";
import { fetchPullRequestDetail } from "../lib/api";
import type { PullRequestDetail, PullRequestItem } from "../lib/types";
import { UnifiedDiff } from "../components/UnifiedDiff";
import { Icon } from "../components/Icon";

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

function formatAuthor(author?: any): string {
  if (!author) return "";
  if (typeof author === "string") return author;
  if (typeof author === "object") {
    return author.login || author.name || "";
  }
  return String(author);
}

export function PullRequestDetailView({
  prNumber,
  onClose,
  initialItem,
}: {
  prNumber: number;
  onClose: () => void;
  initialItem?: PullRequestItem | null;
}) {
  const [detail, setDetail] = useState<PullRequestDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"summary" | "code" | "timeline">("summary");
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetchPullRequestDetail(prNumber);
        if (!cancelled) {
          if (res) {
            setDetail(res);
          } else if (initialItem) {
            // Graceful fallback from listing item
            setDetail({
              number: initialItem.number,
              title: initialItem.title,
              body: "No description provided on host.",
              head_ref: initialItem.head_ref,
              base_ref: initialItem.base_ref,
              state: initialItem.state,
              is_draft: initialItem.is_draft,
              url: initialItem.url,
              updated_at: initialItem.updated_at,
              created_at: initialItem.created_at,
              author: initialItem.author,
              additions: initialItem.additions,
              deletions: initialItem.deletions,
              changed_files: initialItem.changed_files,
              review_decision: initialItem.review_decision,
              files: [],
              commits: [],
              comments: [],
            });
          } else {
            setError(`Could not find pull request #${prNumber}`);
          }
        }
      } catch (err: any) {
        if (!cancelled) setError(err?.message || "Failed to load pull request details");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [prNumber, initialItem]);

  const isDraft = detail?.is_draft || detail?.title.toLowerCase().startsWith("draft:");
  const isOpen = detail?.state === "OPEN";
  const isMerged = detail?.state === "MERGED";
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

  const handleOpenBrowser = () => {
    if (detail?.url) {
      window.dispatchEvent(new CustomEvent("bark-open-browser", { detail: { url: detail.url } }));
    }
  };

  return (
    <div className="pr-detail-view" aria-label={`Pull request #${prNumber} details`}>
      <button
        type="button"
        className="pr-detail-back-btn"
        onClick={onClose}
        aria-label="Back to review list"
      >
        <Icon name="arrowLeft" size={14} />
        <span>Back to review list</span>
      </button>

      {loading && !detail ? (
        <p role="status" className="surface-loading">Loading pull request #{prNumber} details…</p>
      ) : error && !detail ? (
        <div role="alert">
          <p>{error}</p>
          <button className="bark-button mt-3" onClick={onClose}>
            Back to review
          </button>
        </div>
      ) : detail ? (
        <>
          <div className="pr-detail-header">
            <div className="pr-detail-title-row">
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className={`review-pr-badge ${stateCls}`}>{stateLabel}</span>
                  <span className="review-pr-num">#{detail.number}</span>
                </div>
                <h1>{detail.title}</h1>
              </div>

              <div className="review-pr-actions">
                <button
                  type="button"
                  className="bark-button"
                  onClick={handleOpenBrowser}
                  title="Open in Bark's inbuilt browser"
                >
                  <Icon name="globe" size={13} />
                  <span>Inbuilt Browser</span>
                </button>
                <a
                  href={detail.url}
                  target="_blank"
                  rel="noreferrer"
                  className="bark-button"
                  title="Open on GitHub"
                  aria-label="Open on GitHub"
                >
                  <Icon name="link" size={13} />
                </a>
              </div>
            </div>

            <div className="pr-detail-meta-row">
              <div className="flex items-center gap-1.5">
                <Icon name="branch" size={13} className="text-muted" />
                <span className="review-branch-chip" title={detail.head_ref}>{detail.head_ref}</span>
                <Icon name="arrowFlat" size={11} className="text-muted" />
                <span className="review-branch-chip" title={detail.base_ref}>{detail.base_ref}</span>
              </div>

              <div>
                <span className="review-stat-add">+{detail.additions}</span>{" "}
                <span className="review-stat-del">−{detail.deletions}</span>
                <span> · {detail.changed_files} files changed</span>
              </div>

              <span>by @{detail.author.login}</span>
              {detail.updated_at && <span>updated {ago(detail.updated_at)}</span>}

              {detail.mergeable && (
                <span className="review-tab-badge">
                  {detail.mergeable.toLowerCase()}
                </span>
              )}

              {detail.review_decision && (
                <span className="review-tab-badge">
                  {detail.review_decision.replace(/_/g, " ").toLowerCase()}
                </span>
              )}
            </div>
          </div>

          {/* Sub-tabs: Summary / Code / Commits & Timeline */}
          <div className="pr-detail-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "summary"}
              className={`pr-detail-tab-btn ${activeTab === "summary" ? "is-active" : ""}`}
              onClick={() => setActiveTab("summary")}
            >
              <Icon name="doc" size={14} />
              <span>Summary</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "code"}
              className={`pr-detail-tab-btn ${activeTab === "code" ? "is-active" : ""}`}
              onClick={() => setActiveTab("code")}
            >
              <Icon name="code" size={14} />
              <span>Changes & Diff</span>
              <span className="review-tab-badge">{detail.changed_files}</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "timeline"}
              className={`pr-detail-tab-btn ${activeTab === "timeline" ? "is-active" : ""}`}
              onClick={() => setActiveTab("timeline")}
            >
              <Icon name="history" size={14} />
              <span>Commits & Discussion</span>
              <span className="review-tab-badge">
                {detail.commits.length + detail.comments.length}
              </span>
            </button>
          </div>

          {/* Tab 1: Summary */}
          {activeTab === "summary" && (
            <div className="space-y-6">
              {detail.body ? (
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted mb-2">Description</h3>
                  <div className="pr-detail-body">{detail.body}</div>
                </div>
              ) : (
                <p className="text-xs text-muted italic">No description provided.</p>
              )}

              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
                    Changed Files ({detail.files.length || detail.changed_files})
                  </h3>
                  {detail.diff && (
                    <button
                      type="button"
                      className="text-xs text-accent hover:underline"
                      onClick={() => {
                        setSelectedFile(null);
                        setActiveTab("code");
                      }}
                    >
                      View full diff
                    </button>
                  )}
                </div>

                {detail.files.length > 0 ? (
                  <div className="pr-file-list">
                    {detail.files.map((file) => (
                      <div
                        key={file.path}
                        className="pr-file-row"
                        onClick={() => {
                          setSelectedFile(file.path);
                          setActiveTab("code");
                        }}
                        title={`View diff for ${file.path}`}
                      >
                        <div className="flex items-center gap-2 overflow-hidden">
                          <Icon name="doc" size={13} className="text-muted shrink-0" />
                          <span className="font-mono truncate">{file.path}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {file.change_type && (
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-surface text-muted">
                              {file.change_type}
                            </span>
                          )}
                          <span className="review-stat-add">+{file.additions}</span>
                          <span className="review-stat-del">−{file.deletions}</span>
                          <Icon name="chevR" size={12} className="text-muted" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted">File breakdown is not available for this pull request.</p>
                )}
              </div>
            </div>
          )}

          {/* Tab 2: Code & Diff */}
          {activeTab === "code" && (
            <div>
              {selectedFile && (
                <div className="flex items-center justify-between px-3 py-2 mb-3 bg-surface border border-border rounded-lg text-xs">
                  <span>Filtered to file: <code className="text-accent">{selectedFile}</code></span>
                  <button
                    type="button"
                    className="text-accent hover:underline text-xs"
                    onClick={() => setSelectedFile(null)}
                  >
                    Show all files
                  </button>
                </div>
              )}

              {detail.diff ? (
                <UnifiedDiff
                  diff={detail.diff}
                  onlyPath={selectedFile || undefined}
                  emptyLabel="No changes found in diff."
                />
              ) : (
                <div className="p-8 text-center text-xs text-muted border border-dashed border-border rounded-lg">
                  Unified diff is not available for this pull request.
                </div>
              )}
            </div>
          )}

          {/* Tab 3: Commits & Timeline */}
          {activeTab === "timeline" && (
            <div className="space-y-6">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted mb-3">
                  Commits ({detail.commits.length})
                </h3>
                {detail.commits.length > 0 ? (
                  <div className="pr-timeline-list">
                    {detail.commits.map((c) => (
                      <div key={c.oid} className="pr-commit-item">
                        <span className="pr-commit-sha">{c.oid.slice(0, 7)}</span>
                        <span className="font-medium flex-1">{c.message}</span>
                        {c.author && <span className="text-muted text-xs">by {formatAuthor(c.author)}</span>}
                        {c.date && <span className="text-muted text-xs">{ago(c.date)}</span>}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted">No commits recorded on this branch.</p>
                )}
              </div>

              {detail.comments.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted mb-3">
                    Discussion ({detail.comments.length})
                  </h3>
                  <div className="pr-timeline-list">
                    {detail.comments.map((cm, idx) => (
                      <div key={idx} className="pr-comment-item">
                        <div className="pr-comment-header">
                          <span className="font-semibold text-text">@{formatAuthor(cm.author)}</span>
                          <span>{ago(cm.created_at)}</span>
                        </div>
                        <div className="pr-comment-body">{cm.body}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
