import type { Board } from "./types";
import { load as yamlParse, dump as yamlDump } from "js-yaml";

let ws: WebSocket | null = null;
let reloadCallback: (() => void) | null = null;

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

export function connectWs(onReload: () => void): () => void {
  if (isVscode) {
    // VS Code handles reloads via postMessage
    window.addEventListener("message", (event) => {
      if (event.data?.type === "load") onReload();
    });
    return () => {};
  }
  reloadCallback = onReload;
  const proto = location.protocol === "https:" ? "wss" : "ws";
  try {
    ws = new WebSocket(`${proto}://${location.host}/ws`);
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg?.type === "reload") reloadCallback?.();
      } catch {}
    };
    ws.onclose = () => setTimeout(() => connectWs(onReload), 3000);
  } catch {}
  return () => { ws?.close(); ws = null; };
}

// HTTP-based API
async function fetchBoardHttp(): Promise<Board | null> {
  try {
    const res = await fetch("/api/board");
    if (!res.ok) throw new Error("Failed to load board");
    const data = await res.json();
    return yamlParse(data.yaml) as Board;
  } catch (e) {
    console.error("board: fetchBoard failed", e);
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
    console.error("board: saveBoard failed", e);
  }
}

// VS Code API
let pendingBoardVsCode: Board | null = null;
window.addEventListener("message", (event) => {
  const msg = event.data;
  if (msg?.type === "load") {
    try { pendingBoardVsCode = yamlParse(msg.yaml) as Board; } catch {}
  }
});

async function fetchBoardVsCode(): Promise<Board | null> {
  vscodeApi?.postMessage({ type: "ready" });
  return new Promise((resolve) => {
    if (pendingBoardVsCode) { resolve(pendingBoardVsCode); return; }
    const interval = setInterval(() => {
      if (pendingBoardVsCode) { clearInterval(interval); resolve(pendingBoardVsCode); }
    }, 100);
    setTimeout(() => { clearInterval(interval); resolve(null); }, 5000);
  });
}

async function saveBoardVsCode(board: Board): Promise<void> {
  const yaml = yamlDump(board, { indent: 2, lineWidth: -1 });
  vscodeApi?.postMessage({ type: "save", yaml });
}
