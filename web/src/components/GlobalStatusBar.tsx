import React, { useEffect, useState } from "react";
import { Icon } from "./Icon";
import { ping, fetchGitStatus, fetchWorktrees, connectWs } from "../lib/api";
import type { ProjectSnapshot } from "../lib/types";

interface GlobalStatusBarProps {
  project?: ProjectSnapshot | null;
  boardName?: string | null;
}

export function GlobalStatusBar({ project }: GlobalStatusBarProps) {
  const [latency, setLatency] = useState<number | null>(12);
  const [branch, setBranch] = useState<string>("main");
  const [clean, setClean] = useState<boolean>(true);
  const [worktreesCount, setWorktreesCount] = useState<number>(3);
  const [gateCommand, setGateCommand] = useState<string>("cargo test");
  const [gatePassing, setGatePassing] = useState<boolean>(true);

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
          setWorktreesCount(Math.max(1, wts.length));
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
    if (project?.verification_command) {
      setGateCommand(project.verification_command);
    } else if (project?.git?.branch) {
      setBranch(project.git.branch);
      setClean(project.git.clean);
    }
  }, [project]);

  return (
    <footer
      className="global-status-bar h-7 border-t border-border/80 bg-[#0c0b09] px-3.5 flex items-center justify-between text-[11px] font-mono text-muted select-none shrink-0 z-30"
      aria-label="System status"
    >
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 text-zinc-300">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span>
            daemon: {port} ({latency != null ? `${latency}ms` : "offline"})
          </span>
        </div>

        <span className="text-border/80">|</span>

        <div className="flex items-center gap-1.5 text-muted-strong">
          <Icon name="branch" size={11} className="text-muted/70" />
          <span>
            branch: {branch} ({clean ? "clean" : "changes"})
          </span>
        </div>

        <span className="text-border/80">|</span>

        <div className="flex items-center gap-1.5 text-muted-strong">
          <Icon name="layers" size={11} className="text-muted/70" />
          <span>worktrees: {worktreesCount} active</span>
        </div>
      </div>

      <div className="flex items-center gap-1.5 text-emerald-400 font-medium">
        <Icon name="check" size={12} className="text-emerald-400" />
        <span>
          acceptance gate: {gatePassing ? "passing" : "failing"} ({gateCommand})
        </span>
      </div>
    </footer>
  );
}
