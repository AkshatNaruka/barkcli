import type { Board } from "./types";
import { load as yamlParse, dump as yamlDump } from "js-yaml";

let ws: WebSocket | null = null;

// Detect VS Code environment
const isVscode = typeof (window as any).acquireVsCodeApi === "function";
let vscodeApi: any = null;
if (isVscode) {
  vscodeApi = (window as any).acquireVsCodeApi();
}

//
// Public API
//
export async function fetchBoard(): Promise<Board | null> {
  if (isVscode && vscodeApi) {
    return fetchBoardVsCode();
  }
  return fetchBoardHttp();
}

export async function saveBoard(board: Board): Promise<void> {
  if (isVscode && vscodeApi) {
    return saveBoardVsCode(board);
  }
  return saveBoardHttp(board);
}

// ── Reload callback (for external file changes) ──

let reloadCallback: (() => void) | null = null;

export function connectWs(onReload: () => void): () => void {
  if (isVscode) {
    // VS Code: callback is invoked by the global message listener
    // only for *subsequent* loads (external file changes, not initial)
    reloadCallback = onReload;
    return () => { reloadCallback = null; };
  }
  // Browser mode: WebSocket-based reload
  const proto = location.protocol === "https:" ? "wss" : "ws";
  try {
    ws = new WebSocket(`${proto}://${location.host}/ws`);
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg?.type === "reload") onReload();
      } catch {}
    };
    ws.onclose = () => setTimeout(() => connectWs(onReload), 3000);
  } catch {}
  return () => { ws?.close(); ws = null; };
}

// ── HTTP-based API (browser mode) ──

async function fetchBoardHttp(): Promise<Board | null> {
  try {
    const res = await fetch("/api/board");
    if (!res.ok) throw new Error("Failed to load board");
    const data = await res.json();
    return yamlParse(data.yaml) as Board;
  } catch (e) {
    console.error("barkcli: fetchBoard failed", e);
    return null;
  }
}

async function saveBoardHttp(board: Board): Promise<void> {
  try {
    const yaml = yamlDump(board, { indent: 2, lineWidth: -1 });
    await fetch("/api/board", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ yaml }),
    });
  } catch (e) {
    console.error("barkcli: saveBoard failed", e);
  }
}

// ── VS Code API (postMessage bridge) ──

let pendingBoardVsCode: Board | null = null;
let initialLoadDone = false;

// Single global listener: handles ALL 'load' messages from the extension.
// On first load: just stores the parsed board.
// On subsequent loads (external changes): also triggers the reload callback.
window.addEventListener("message", (event) => {
  const msg = event.data;
  if (msg?.type === "load") {
    try { pendingBoardVsCode = yamlParse(msg.yaml) as Board; } catch {}
    if (reloadCallback && initialLoadDone) {
      reloadCallback();
    }
    initialLoadDone = true;
  }
  if (msg?.type === "gitInfo" && gitInfoResolve) {
    gitInfoResolve({ branch: msg.branch, lastCommit: msg.lastCommit, authors: msg.authors });
    gitInfoResolve = null;
  }
  if (msg?.type === "cardHistory") {
    const resolve = historyResolves.get(msg.cardId);
    if (resolve) {
      resolve(msg.entries || []);
      historyResolves.delete(msg.cardId);
    }
  }
});

async function fetchBoardVsCode(): Promise<Board | null> {
  // If we already loaded (e.g. via external change), return cached
  if (pendingBoardVsCode && initialLoadDone) return pendingBoardVsCode;

  // Request initial data from the extension
  vscodeApi?.postMessage({ type: "ready" });

  return new Promise((resolve) => {
    const check = () => {
      if (pendingBoardVsCode) {
        resolve(pendingBoardVsCode);
        return true;
      }
      return false;
    };
    if (check()) return;
    const interval = setInterval(() => { if (check()) clearInterval(interval); }, 100);
    setTimeout(() => { clearInterval(interval); if (!pendingBoardVsCode) resolve(null); }, 5000);
  });
}

async function saveBoardVsCode(board: Board): Promise<void> {
  const yaml = yamlDump(board, { indent: 2, lineWidth: -1 });
  vscodeApi?.postMessage({ type: "save", yaml });
}

// ── Git info + Card history (VS Code mode) ──

export interface GitInfo { branch: string; lastCommit: string; authors: string[] }

export function requestGitInfo() { vscodeApi?.postMessage({ type: "getGitInfo" }); }
export function requestCardHistory(cardId: string) { vscodeApi?.postMessage({ type: "getCardHistory", cardId }); }

let gitInfoResolve: ((v: GitInfo) => void) | null = null;
const historyResolves = new Map<string, (entries: any[]) => void>();

export function getGitInfo(): Promise<GitInfo> {
  return new Promise((resolve) => {
    requestGitInfo();
    gitInfoResolve = resolve;
  });
}

export function getCardHistory(cardId: string): Promise<any[]> {
  return new Promise((resolve) => {
    requestCardHistory(cardId);
    historyResolves.set(cardId, resolve);
  });
}
