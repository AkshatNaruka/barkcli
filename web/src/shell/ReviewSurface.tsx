import React, { useEffect, useState } from "react";
import { connectWs, fetchReviewQueue, fetchThreadRuns } from "../lib/api";
import { sortQueue } from "../components/ReviewQueuePanel";
import { navigate } from "../lib/hashnav";
import type { QueueItem } from "../lib/types";
import { Icon } from "../components/Icon";

function hasBuild(item: QueueItem): boolean {
  return Boolean(item.branch) && (item.files > 0 || item.additions > 0 || item.deletions > 0);
}

export function ReviewSurface({ boardName }: { boardName: string | null }) {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const queue = await fetchReviewQueue(boardName, false, true);
        if (!cancelled) { setItems(sortQueue(queue.items)); setError(null); }
      } catch { if (!cancelled) setError("Could not load reviews. Check the server, then retry."); }
      finally { if (!cancelled) setLoading(false); }
    };
    void load(); const cleanup = connectWs(() => void load());
    return () => { cancelled = true; cleanup(); };
  }, [boardName, revision]);
  const open = async (item: QueueItem) => {
    if (opening) return;
    setOpening(item.card_id);
    try {
      const runs = await fetchThreadRuns(item.card_id);
      const run = [...runs].reverse().find((run) => run.status !== "merged");
      navigate("chat", { board: boardName || undefined, thread: item.card_id, run: run?.id, panel: hasBuild(item) ? "changes" : "plan" });
    } finally { setOpening(null); }
  };
  return <div className="review-surface">
    <div className="review-intro"><h2>Work that needs your review</h2><p>Review plans, changes, and checks before merging.</p></div>
    {loading ? <p role="status" className="surface-loading">Loading review…</p> : error ? <div role="alert"><p>{error}</p><button className="bark-button mt-3" onClick={() => setRevision((value) => value + 1)}>Retry</button></div> : !items.length ? <div className="review-empty"><Icon name="check" size={20} /><h3>Nothing to review</h3><p>Finished builds appear here when they need attention.</p><button className="bark-button" onClick={() => navigate("chat")}>Back to building</button></div> : <div className="review-list">{items.map((item) => {
      const built = hasBuild(item);
      const meta = built ? `${item.files} files · +${item.additions} −${item.deletions}` : "No build yet · plan only";
      const reason = built ? item.risk.reasons[0]?.detail || "Inspect the changes and their verification evidence." : "Nothing has been built for this thread yet.";
      return <section key={item.card_id} className="review-row" style={{ contentVisibility: "auto", containIntrinsicSize: "auto 90px" }}>
        <button className="review-open" onClick={() => void open(item)} disabled={Boolean(opening)}><span className="review-title">{item.title}</span><span className="review-meta">{meta}</span><span className="review-reason">{reason}</span><span className="review-next">{opening === item.card_id ? "Opening…" : built ? "Review changes" : "Open thread"}<Icon name="chevR" size={14} /></span></button>
        {built && <details><summary>Review priority</summary><p>{item.risk.tier} · score {item.risk.score}. A prioritization signal, not a correctness guarantee.</p>{item.risk.reasons.map((reason, index) => <p key={index}>{reason.detail}</p>)}</details>}
      </section>;
    })}</div>}
  </div>;
}