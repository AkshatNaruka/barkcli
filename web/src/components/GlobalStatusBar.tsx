import React, { useEffect, useState } from "react";
import { Icon } from "./Icon";
import { ping, fetchGitStatus, fetchWorktrees, connectWs } from "../lib/api";
import type { ProjectSnapshot } from "../lib/types";

interface GlobalStatusBarProps {
  project?: ProjectSnapshot | null;
  boardName?: string | null;
}

export function GlobalStatusBar({ project }: GlobalStatusBarProps) {
  const [latency, setLatency] = useState<number | null>(null);
  const [branch, setBranch] = useState<string>(project?.git?.branch || "main");
  const [clean, setClean] = useState<boolean>(project?.git?.clean ?? true);
  const [worktreesCount, setWorktreesCount] = useState<number>(0);
  const [gateCommand, setGateCommand] = useState<string>(project?.verification_command || "gate");

  const port = typeof window !== "undefined" && window.location.port ? window.location.port : "4321";

  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      const start = performance.now();
      try {
        await ping();
        if (!cancelled) {
          const delta = Math.round(performance.now() - start);
          setLatency(Math.max(1, delta));
        }
      } catch {
        if (!cancelled) setLatency(null);
      }

      try {
        const git = await fetchGitStatus();
        if (!cancelled && git) {
          setBranch(git.branch || "main");
          setClean(Boolean(git.clean));
        }
      } catch {
        // preserve current
      }

      try {
        const wts = await fetchWorktrees();
        if (!cancelled && Array.isArray(wts)) {
          setWorktreesCount(Math.max(0, wts.length));
        }
      } catch {
        // preserve current
      }
    };

    void refresh();
    const interval = setInterval(refresh, 20000);
    const cleanupWs = connectWs(() => void refresh());
    const onUpdated = () => void refresh();
    window.addEventListener("bark-threads-changed", onUpdated);

    return () => {
      cancelled = true;
      clearInterval(interval);
      cleanupWs();
      window.removeEventListener("bark-threads-changed", onUpdated);
    };
  }, []);

  useEffect(() => {
    if (project?.verification_command) setGateCommand(project.verification_command);
    if (project?.git?.branch) {
      setBranch(project.git.branch);
      setClean(project.git.clean);
    }
  }, [project]);

  const online = latency != null;

  return (
    <footer className="global-status-bar vscode-statusbar" aria-label="System status" role="status">
      <div className="vscode-statusbar-left">
        <span className="vscode-statusbar-segment vscode-statusbar-remote" title={online ? `Local daemon :${port} (${latency}ms)` : "Local daemon offline"}>
          <span className={`vscode-statusbar-dot ${online ? "is-ok" : "is-offline"}`} aria-hidden="true" />
          <Icon name="terminal" size={12} />
        </span>
        <button type="button" className="vscode-statusbar-segment" title={`Branch: ${branch} (${clean ? "clean" : "changes"})`}>
          <Icon name="branch" size={12} />
          <span>{branch}</span>
          {!clean ? <span className="vscode-statusbar-muted">*</span> : null}
        </button>
        {worktreesCount > 0 ? (
          <span className="vscode-statusbar-segment" title={`${worktreesCount} worktree${worktreesCount === 1 ? "" : "s"}`}>
            <Icon name="layers" size={12} />
            <span>{worktreesCount}</span>
          </span>
        ) : null}
      </div>
      <div className="vscode-statusbar-right">
        <span className="vscode-statusbar-segment" title={`Acceptance gate command: ${gateCommand}`}>
          <Icon name="check" size={12} />
          <span className="vscode-statusbar-truncate">{gateCommand}</span>
        </span>
        <span className="vscode-statusbar-segment vscode-statusbar-muted" title={online ? `Connected ${latency}ms` : "Offline"}>
          {online ? `${latency}ms` : "offline"}
        </span>
      </div>
    </footer>
  );
}
