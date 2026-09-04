import type {
  Board,
  CardContext,
  HistoryEntry,
  SessionEntry,
  Sprint,
  MemoryEntry,
  ProjectFact,
  Spec,
  SpecCoverage,
  CheckpointEntry,
  ValidateBoardResult,
  DoctorBoardResult,
  DiffCard,
  DiffMoved,
  BlameEntry,
} from "./types";
import { load as yamlParse, dump as yamlDump } from "js-yaml";

// js-yaml parses ISO timestamps (due_date, created_at, ...) into Date objects.
// Convert them back to ISO strings so the UI can treat them as strings.
function reviveDates(obj: any): any {
  if (obj instanceof Date) return obj.toISOString();
  if (Array.isArray(obj)) return obj.map(reviveDates);
  if (obj && typeof obj === "object") {
    for (const k of Object.keys(obj)) obj[k] = reviveDates(obj[k]);
    return obj;
  }
  return obj;
}

function parseBoardYaml(yaml: string): Board {
  const board = reviveDates(yamlParse(yaml)) as Board;
  // Normalize fields that older board files don't carry.
  if (board.cards) {
    for (const c of board.cards) {
      c.links = c.links || [];
      c.acceptance_criteria = c.acceptance_criteria || [];
      c.checklist = c.checklist || [];
      c.comments = c.comments || [];
      c.attachments = c.attachments || [];
      c.labels = c.labels || [];
    }
  }
  return board;
}

// ── Access token ──
// The server may require a token (barkcli serve --token X). The CLI opens the
// browser with ?token=...; we persist it for the tab's lifetime.
function resolveToken(): string {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get("token") || "";
    if (fromUrl) sessionStorage.setItem("barkcli-token", fromUrl);
    return fromUrl || sessionStorage.getItem("barkcli-token") || "";
  } catch {
    return "";
  }
}

const TOKEN = resolveToken();

function withToken(url: string): string {
  if (!TOKEN) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}token=${encodeURIComponent(TOKEN)}`;
}

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
export async function fetchBoard(name?: string): Promise<Board | null> {
  if (isVscode && vscodeApi) {
    return fetchBoardVsCode();
  }
  return fetchBoardHttp(name);
}

export async function fetchBoards(): Promise<string[]> {
  if (isVscode && vscodeApi) return [];
  try {
    const res = await fetch(withToken("/api/boards"));
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.boards) ? data.boards : [];
  } catch {
    return [];
  }
}

export async function saveBoard(board: Board, name?: string): Promise<void> {
  if (isVscode && vscodeApi) {
    return saveBoardVsCode(board);
  }
  return saveBoardHttp(board, name);
}

export async function fetchSprints(name?: string): Promise<Sprint[]> {
  if (isVscode && vscodeApi) {
    return fetchSprintsVsCode();
  }
  try {
    const q = name ? `?name=${encodeURIComponent(name)}` : "";
    const res = await fetch(withToken(`/api/sprints${q}`));
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.sprints) ? data.sprints : [];
  } catch {
    return [];
  }
}

export async function startSprint(sprintName: string, end?: string): Promise<boolean> {
  if (isVscode && vscodeApi) return false;
  try {
    const res = await fetch(withToken("/api/sprints"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: sprintName, end: end || null }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function endSprint(sprintName?: string): Promise<boolean> {
  if (isVscode && vscodeApi) return false;
  try {
    const res = await fetch(withToken("/api/sprints/end"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: sprintName || null }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export interface BoardConfig {
  ai: { base_url: string; model: string };
}

export async function fetchConfig(): Promise<BoardConfig | null> {
  if (isVscode && vscodeApi) return null;
  try {
    const res = await fetch(withToken("/api/config"));
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function fetchCardContext(cardId: string): Promise<CardContext | null> {
  if (isVscode && vscodeApi) {
    return fetchCardContextVsCode(cardId);
  }
  try {
    const res = await fetch(withToken("/api/context"));
    if (!res.ok) return null;
    const data = await res.json();
    return data.cards?.[cardId] ?? null;
  } catch {
    return null;
  }
}

export async function fetchContext(): Promise<{ cards: Record<string, CardContext> } | null> {
  if (isVscode && vscodeApi) return null;
  try {
    const res = await fetch(withToken("/api/context"));
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function fetchHistory(cardId?: string, limit?: number): Promise<HistoryEntry[]> {
  if (isVscode && vscodeApi) {
    return fetchHistoryVsCode(cardId);
  }
  try {
    const params = new URLSearchParams();
    if (cardId) params.set("card", cardId);
    if (limit) params.set("limit", String(limit));
    const qs = params.toString();
    const res = await fetch(withToken(`/api/history${qs ? `?${qs}` : ""}`));
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.entries) ? data.entries : [];
  } catch {
    return [];
  }
}

export async function fetchSessions(limit?: number): Promise<SessionEntry[]> {
  if (isVscode && vscodeApi) {
    return fetchSessionsVsCode();
  }
  try {
    const qs = limit ? `?limit=${limit}` : "";
    const res = await fetch(withToken(`/api/sessions${qs}`));
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.sessions) ? data.sessions : [];
  } catch {
    return [];
  }
}

export async function syncContext(): Promise<boolean> {
  if (isVscode && vscodeApi) {
    vscodeApi?.postMessage({ type: "syncContext" });
    return true;
  }
  try {
    const res = await fetch(withToken("/api/context/sync"), { method: "POST" });
    return res.ok;
  } catch {
    return false;
  }
}

export async function clearContext(): Promise<boolean> {
  if (isVscode && vscodeApi) return false;
  try {
    const res = await fetch(withToken("/api/context/clear"), { method: "POST" });
    return res.ok;
  } catch {
    return false;
  }
}

export async function codeSearch(query: string): Promise<
  { path: string; symbols: string[]; cards: string[] }[]
> {
  try {
    const res = await fetch(withToken(`/api/code?q=${encodeURIComponent(query)}`));
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.results) ? data.results : [];
  } catch {
    return [];
  }
}

// ── Reload callback (for external file changes) ──

let reloadCallback: ((version: number) => void) | null = null;

export function connectWs(onReload: (version: number) => void): () => void {
  if (isVscode) {
    // VS Code: callback is invoked by the global message listener
    // only for *subsequent* loads (external file changes, not initial)
    reloadCallback = onReload;
    return () => { reloadCallback = null; };
  }
  // Browser mode: WebSocket-based reload
  const proto = location.protocol === "https:" ? "wss" : "ws";
  try {
    ws = new WebSocket(withToken(`${proto}://${location.host}/ws`));
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg?.type === "reload") onReload(Number(msg.version) || 0);
      } catch {}
    };
    ws.onclose = () => setTimeout(() => connectWs(onReload), 3000);
  } catch {}
  return () => { ws?.close(); ws = null; };
}

// ── HTTP-based API (browser mode) ──

async function fetchBoardHttp(name?: string): Promise<Board | null> {
  try {
    const qs = name ? `?name=${encodeURIComponent(name)}` : "";
    const res = await fetch(withToken(`/api/board${qs}`));
    if (!res.ok) throw new Error("Failed to load board");
    const data = await res.json();
    return parseBoardYaml(data.yaml);
  } catch (e) {
    console.error("barkcli: fetchBoard failed", e);
    return null;
  }
}

async function saveBoardHttp(board: Board, name?: string): Promise<void> {
  try {
    const yaml = yamlDump(board, { indent: 2, lineWidth: -1 });
    await fetch(withToken("/api/board"), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ yaml, name: name || null }),
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
    try { pendingBoardVsCode = parseBoardYaml(msg.yaml); } catch {}
    if (reloadCallback && initialLoadDone) {
      reloadCallback(Date.now());
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
  if (msg?.type === "sprints" && sprintsResolve) {
    sprintsResolve(Array.isArray(msg.sprints) ? msg.sprints : []);
    sprintsResolve = null;
  }
  if (msg?.type === "cardContext") {
    const resolve = contextResolves.get(msg.cardId);
    if (resolve) {
      resolve(msg.context || null);
      contextResolves.delete(msg.cardId);
    }
  }
  if (msg?.type === "history" && historyResolve) {
    historyResolve(Array.isArray(msg.entries) ? msg.entries : []);
    historyResolve = null;
  }
  if (msg?.type === "sessions" && sessionsResolve) {
    sessionsResolve(Array.isArray(msg.sessions) ? msg.sessions : []);
    sessionsResolve = null;
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

// ── Sprints (VS Code mode) ──

let sprintsResolve: ((s: Sprint[]) => void) | null = null;

function fetchSprintsVsCode(): Promise<Sprint[]> {
  vscodeApi?.postMessage({ type: "getSprints" });
  return new Promise((resolve) => {
    sprintsResolve = resolve;
    setTimeout(() => {
      if (sprintsResolve) {
        sprintsResolve([]);
        sprintsResolve = null;
      }
    }, 3000);
  });
}

// ── Context / History / Sessions (VS Code mode) ──

const contextResolves = new Map<string, (c: CardContext | null) => void>();
let historyResolve: ((h: HistoryEntry[]) => void) | null = null;
let sessionsResolve: ((s: SessionEntry[]) => void) | null = null;

function fetchCardContextVsCode(cardId: string): Promise<CardContext | null> {
  vscodeApi?.postMessage({ type: "getCardContext", cardId });
  return new Promise((resolve) => {
    contextResolves.set(cardId, resolve);
    setTimeout(() => {
      if (contextResolves.has(cardId)) {
        contextResolves.delete(cardId);
        resolve(null);
      }
    }, 3000);
  });
}

function fetchHistoryVsCode(cardId?: string): Promise<HistoryEntry[]> {
  vscodeApi?.postMessage({ type: "getHistory", cardId });
  return new Promise((resolve) => {
    historyResolve = resolve;
    setTimeout(() => {
      if (historyResolve) {
        historyResolve([]);
        historyResolve = null;
      }
    }, 3000);
  });
}

function fetchSessionsVsCode(): Promise<SessionEntry[]> {
  vscodeApi?.postMessage({ type: "getSessions" });
  return new Promise((resolve) => {
    sessionsResolve = resolve;
    setTimeout(() => {
      if (sessionsResolve) {
        sessionsResolve([]);
        sessionsResolve = null;
      }
    }, 3000);
  });
}

export function openFileInEditor(path: string, line?: number) {
  vscodeApi?.postMessage({ type: "openFile", path, line: line ?? 0 });
}

// ── Memory API ──

export async function fetchMemory(name?: string, q?: string, tier?: string, limit?: number): Promise<{ memories: MemoryEntry[]; total: number }> {
  if (isVscode) return { memories: [], total: 0 };
  try {
    const params = new URLSearchParams();
    if (name) params.set("name", name);
    if (q) params.set("q", q);
    if (tier) params.set("tier", tier);
    if (limit) params.set("limit", String(limit));
    const qs = params.toString();
    const res = await fetch(withToken(`/api/memory${qs ? `?${qs}` : ""}`));
    if (!res.ok) return { memories: [], total: 0 };
    return await res.json();
  } catch { return { memories: [], total: 0 }; }
}

export async function addMemory(content: string, tier?: string, tags?: string[], source?: string, name?: string): Promise<MemoryEntry | null> {
  if (isVscode) return null;
  try {
    const params = new URLSearchParams();
    if (name) params.set("name", name);
    const res = await fetch(withToken(`/api/memory?${params.toString()}`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, tier, tags, source }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

export async function deleteMemory(id: string, name?: string): Promise<boolean> {
  if (isVscode) return false;
  try {
    const params = new URLSearchParams();
    if (name) params.set("name", name);
    const res = await fetch(withToken(`/api/memory/${id}?${params.toString()}`), { method: "DELETE" });
    return res.ok;
  } catch { return false; }
}

export async function fetchMemoryStats(name?: string): Promise<{ total: number; by_tier: Record<string, number>; facts: number }> {
  if (isVscode) return { total: 0, by_tier: {}, facts: 0 };
  try {
    const params = new URLSearchParams();
    if (name) params.set("name", name);
    const res = await fetch(withToken(`/api/memory/stats?${params.toString()}`));
    if (!res.ok) return { total: 0, by_tier: {}, facts: 0 };
    return await res.json();
  } catch { return { total: 0, by_tier: {}, facts: 0 }; }
}

export async function addFact(fact: string, category?: string, confidence?: number, sources?: string[], name?: string): Promise<ProjectFact | null> {
  if (isVscode) return null;
  try {
    const params = new URLSearchParams();
    if (name) params.set("name", name);
    const res = await fetch(withToken(`/api/memory/fact?${params.toString()}`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fact, category, confidence, sources }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

export async function fetchFacts(name?: string, category?: string): Promise<ProjectFact[]> {
  if (isVscode) return [];
  try {
    const params = new URLSearchParams();
    if (name) params.set("name", name);
    if (category) params.set("category", category);
    const res = await fetch(withToken(`/api/memory/facts?${params.toString()}`));
    if (!res.ok) return [];
    const data = await res.json();
    return data.facts || [];
  } catch { return []; }
}

// ── Specs API ──

export async function fetchSpecs(name?: string): Promise<Spec[]> {
  if (isVscode) return [];
  try {
    const params = new URLSearchParams();
    if (name) params.set("name", name);
    const res = await fetch(withToken(`/api/specs?${params.toString()}`));
    if (!res.ok) return [];
    const data = await res.json();
    return data.specs || [];
  } catch { return []; }
}

export async function fetchSpec(specId: string, name?: string): Promise<Spec | null> {
  if (isVscode) return null;
  try {
    const params = new URLSearchParams();
    if (name) params.set("name", name);
    const res = await fetch(withToken(`/api/specs/${specId}?${params.toString()}`));
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

export async function createSpec(title: string, description?: string, priority?: string, tags?: string[], name?: string): Promise<Spec | null> {
  if (isVscode) return null;
  try {
    const params = new URLSearchParams();
    if (name) params.set("name", name);
    const res = await fetch(withToken(`/api/specs?${params.toString()}`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, description, priority, tags }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

export async function updateSpec(specId: string, data: { status?: string; priority?: string; description?: string; title?: string }, name?: string): Promise<Spec | null> {
  if (isVscode) return null;
  try {
    const params = new URLSearchParams();
    if (name) params.set("name", name);
    const res = await fetch(withToken(`/api/specs/${specId}?${params.toString()}`), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

export async function deleteSpec(specId: string, name?: string): Promise<boolean> {
  if (isVscode) return false;
  try {
    const params = new URLSearchParams();
    if (name) params.set("name", name);
    const res = await fetch(withToken(`/api/specs/${specId}?${params.toString()}`), { method: "DELETE" });
    return res.ok;
  } catch { return false; }
}

export async function addRequirement(specId: string, title: string, description?: string, acceptanceCriteria?: string[], name?: string): Promise<Spec | null> {
  if (isVscode) return null;
  try {
    const params = new URLSearchParams();
    if (name) params.set("name", name);
    const res = await fetch(withToken(`/api/specs/${specId}/requirements?${params.toString()}`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, description, acceptance_criteria: acceptanceCriteria }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

export async function fetchSpecCoverage(name?: string): Promise<SpecCoverage | null> {
  if (isVscode) return null;
  try {
    const params = new URLSearchParams();
    if (name) params.set("name", name);
    const res = await fetch(withToken(`/api/specs/coverage?${params.toString()}`));
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

// ── Checkpoints API ──

export async function fetchCheckpoints(name?: string): Promise<CheckpointEntry[]> {
  if (isVscode) return [];
  try {
    const params = new URLSearchParams();
    if (name) params.set("name", name);
    const res = await fetch(withToken(`/api/checkpoints?${params.toString()}`));
    if (!res.ok) return [];
    const data = await res.json();
    return data.checkpoints || [];
  } catch { return []; }
}

export async function saveCheckpoint(label?: string, name?: string): Promise<boolean> {
  if (isVscode) return false;
  try {
    const params = new URLSearchParams();
    if (name) params.set("name", name);
    const res = await fetch(withToken(`/api/checkpoints?${params.toString()}`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label }),
    });
    return res.ok;
  } catch { return false; }
}

export async function restoreCheckpoint(id: string, name?: string): Promise<boolean> {
  if (isVscode) return false;
  try {
    const params = new URLSearchParams();
    if (name) params.set("name", name);
    const res = await fetch(withToken(`/api/checkpoints/${id}/restore?${params.toString()}`), { method: "POST" });
    return res.ok;
  } catch { return false; }
}

// ── Undo/Diff/Blame API ──

export async function undo(name?: string): Promise<{ ok: boolean; undid?: string; card_id?: string }> {
  if (isVscode) return { ok: false };
  try {
    const params = new URLSearchParams();
    if (name) params.set("name", name);
    const res = await fetch(withToken(`/api/undo?${params.toString()}`), { method: "POST" });
    if (!res.ok) return { ok: false };
    return await res.json();
  } catch { return { ok: false }; }
}

export async function fetchDiff(name?: string): Promise<{ added: DiffCard[]; removed: DiffCard[]; moved: DiffMoved[] }> {
  if (isVscode) return { added: [], removed: [], moved: [] };
  try {
    const params = new URLSearchParams();
    if (name) params.set("name", name);
    const res = await fetch(withToken(`/api/diff?${params.toString()}`));
    if (!res.ok) return { added: [], removed: [], moved: [] };
    return await res.json();
  } catch { return { added: [], removed: [], moved: [] }; }
}

export async function fetchBlame(cardId: string, name?: string): Promise<BlameEntry[]> {
  if (isVscode) return [];
  try {
    const params = new URLSearchParams();
    if (name) params.set("name", name);
    const res = await fetch(withToken(`/api/blame/${cardId}?${params.toString()}`));
    if (!res.ok) return [];
    const data = await res.json();
    return data.entries || [];
  } catch { return []; }
}

export async function saveSnapshot(label: string, name?: string): Promise<boolean> {
  if (isVscode) return false;
  try {
    const params = new URLSearchParams();
    if (name) params.set("name", name);
    const res = await fetch(withToken(`/api/snapshot?${params.toString()}`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label }),
    });
    return res.ok;
  } catch { return false; }
}

// ── Import/Export API ──

export async function exportBoard(name?: string, format?: string): Promise<string | null> {
  if (isVscode) return null;
  try {
    const params = new URLSearchParams();
    if (name) params.set("name", name);
    if (format) params.set("format", format);
    const res = await fetch(withToken(`/api/export?${params.toString()}`));
    if (!res.ok) return null;
    return await res.text();
  } catch { return null; }
}

export async function importBoard(data: string, format: "yaml" | "json", name?: string): Promise<boolean> {
  if (isVscode) return false;
  try {
    const params = new URLSearchParams();
    if (name) params.set("name", name);
    const body = format === "json" ? { json: data } : { yaml: data };
    const res = await fetch(withToken(`/api/import?${params.toString()}`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch { return false; }
}

// ── Validate/Doctor API ──

export async function validateBoards(): Promise<{ boards: ValidateBoardResult[]; all_valid: boolean }> {
  if (isVscode) return { boards: [], all_valid: true };
  try {
    const res = await fetch(withToken("/api/validate"));
    if (!res.ok) return { boards: [], all_valid: true };
    return await res.json();
  } catch { return { boards: [], all_valid: true }; }
}

export async function doctorBoards(): Promise<{ boards: DoctorBoardResult[]; fixed: number }> {
  if (isVscode) return { boards: [], fixed: 0 };
  try {
    const res = await fetch(withToken("/api/doctor"), { method: "POST" });
    if (!res.ok) return { boards: [], fixed: 0 };
    return await res.json();
  } catch { return { boards: [], fixed: 0 }; }
}

// ── Board CRUD API ──

export async function createBoard(title: string, description?: string, columns?: string[]): Promise<string | null> {
  if (isVscode) return null;
  try {
    const res = await fetch(withToken("/api/boards/create"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, description, columns }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.name || null;
  } catch { return null; }
}

export async function deleteBoard(name: string): Promise<boolean> {
  if (isVscode) return false;
  try {
    const res = await fetch(withToken(`/api/boards/${encodeURIComponent(name)}`), { method: "DELETE" });
    return res.ok;
  } catch { return false; }
}

// ── Card Comment API ──

export async function addComment(cardId: string, author: string, text: string, name?: string): Promise<boolean> {
  if (isVscode) return false;
  try {
    const params = new URLSearchParams();
    if (name) params.set("name", name);
    const res = await fetch(withToken(`/api/board/cards/${cardId}/comments?${params.toString()}`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ author, text }),
    });
    return res.ok;
  } catch { return false; }
}

// ── Documentation API ──

export interface DocEntry {
  slug: string;
  title: string;
}

export async function fetchDocs(): Promise<DocEntry[]> {
  if (isVscode) return [];
  try {
    const res = await fetch(withToken("/api/docs"));
    if (!res.ok) return [];
    const data = await res.json();
    return data.docs || [];
  } catch { return []; }
}

export async function fetchDoc(slug: string): Promise<string | null> {
  if (isVscode) return null;
  try {
    const res = await fetch(withToken(`/api/docs/${encodeURIComponent(slug)}`));
    if (!res.ok) return null;
    const data = await res.json();
    return data.content || null;
  } catch { return null; }
}

// ── Mind & Skills API (v0.3.0) ──

export async function fetchMind(name?: string): Promise<any | null> {
  if (isVscode) return null;
  try {
    const params = new URLSearchParams();
    if (name) params.set("name", name);
    const res = await fetch(withToken(`/api/mind${params.toString() ? `?${params.toString()}` : ""}`));
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

export async function fetchSkills(): Promise<any[]> {
  if (isVscode) return [];
  try {
    const res = await fetch(withToken("/api/skills"));
    if (!res.ok) return [];
    const data = await res.json();
    return data.skills || [];
  } catch { return []; }
}

// ── Autopilot API (agent-driven loop with human gates) ──

export interface AutopilotStatus {
  board: string;
  phase: string | { [k: string]: any };
  phase_label: string;
  needs_human: boolean;
  human_prompt: string | null;
  agent_action: string | null;
  counts: {
    todo_unplanned: number;
    pending_proposals: number;
    queue_pending: number;
    queue_active: number;
    in_review: number;
    blocked: number;
  };
}

export interface PlanProposal {
  card_id: string;
  card_title: string;
  proposed_at: string;
  proposed_by: string;
  requirements: { title: string; acceptance_criteria: string[]; effort: number }[];
  children: {
    title: string;
    description: string;
    priority: string;
    effort: number;
    labels: string[];
    acceptance_criteria: string[];
  }[];
  estimated_total_effort: number;
  risk_level: string;
  rationale: string;
}

async function postJson(url: string, body: any): Promise<any | null> {
  if (isVscode) return null;
  try {
    const res = await fetch(withToken(url), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

export async function fetchAutopilotStatus(name?: string): Promise<AutopilotStatus | null> {
  if (isVscode) return null;
  try {
    const params = name ? `?name=${encodeURIComponent(name)}` : "";
    const res = await fetch(withToken(`/api/autopilot/status${params}`));
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

export async function submitIntent(text: string, kind?: string, name?: string): Promise<any | null> {
  return postJson("/api/intake", { text, kind, board: name });
}

export async function proposePlan(cardId: string, name?: string): Promise<PlanProposal | null> {
  return postJson("/api/autopilot/propose", { card_id: cardId, board: name, by: "web" });
}

export async function approvePlan(cardId: string, name?: string): Promise<any | null> {
  return postJson("/api/autopilot/approve", { card_id: cardId, board: name });
}

export async function rejectPlan(cardId: string, reason?: string, name?: string): Promise<any | null> {
  return postJson("/api/autopilot/reject", { card_id: cardId, reason, board: name });
}

export async function runReview(name?: string): Promise<any | null> {
  return postJson("/api/review", { board: name, all: true, auto: true });
}
