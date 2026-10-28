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
  ThreadEvent,
  ThreadSummary,
  ThreadDetail,
  RunRecord,
  RunDiff,
  RunGate,
  RunContext,
  ContextPack,
  DiscoveredSkill,
  ProviderStatus,
  SessionTranscript,
  TaskDiff,
  RoleDef,
  AgentProfile,
  ProfileStatus,
  OrchestraSnapshot,
  ProductPlan,
  DispatchReport,
  AssignmentRecommendation,
  ReviewState,
  ReviewComment,
  RepoEntry,
  RepoFile,
  GitStatus,
  EditorDetection,
  WorktreeInfo,
} from "./types";
import { load as yamlParse, dump as yamlDump } from "js-yaml";
import { isDemoMode, getDemoCardHistory, onDemoChange } from "./demo";

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

// ── Smart History Bundles ──

export interface Bundle {
  id: string;
  title: string;
  kind: string;
  status: string;
  branch: string;
  commit_count: number;
  first_sha: string | null;
  last_sha: string | null;
  confidence: number;
  card_id: string | null;
  summary?: string;
  commits?: Array<{ sha: string; subject: string; author: string; date: string }>;
}

export async function fetchBundles(): Promise<{ bundles: Bundle[] }> {
  const res = await fetch("/api/bundles");
  if (!res.ok) throw new Error("Failed to fetch bundles");
  return res.json();
}

export async function scanBundles(): Promise<void> {
  const res = await fetch("/api/bundles/scan", { method: "POST" });
  if (!res.ok) throw new Error("Scan failed");
}

export async function approveBundle(id: string): Promise<void> {
  const res = await fetch(`/api/bundles/${id}/approve`, { method: "POST" });
  if (!res.ok) throw new Error("Approve failed");
}

export async function rejectBundle(id: string): Promise<void> {
  const res = await fetch(`/api/bundles/${id}/reject`, { method: "POST" });
  if (!res.ok) throw new Error("Reject failed");
}

export async function sealBundle(id: string): Promise<void> {
  const res = await fetch(`/api/bundles/${id}/seal`, { method: "POST" });
  if (!res.ok) throw new Error("Seal failed");
}

export async function fetchBundleTree(): Promise<string> {
  const res = await fetch("/api/bundles/tree");
  if (!res.ok) throw new Error("Failed to fetch tree");
  const data = await res.json();
  return data.tree || "";
}

export interface GitCommit {
  sha: string;
  parents: string[];
  subject: string;
  body: string;
  author: string;
  author_email: string;
  date: string;
  trailers: Array<[string, string]>;
  is_merge: boolean;
  is_empty: boolean;
  files_changed: string[];
  additions: number;
  deletions: number;
  patch_id?: string | null;
}

export interface GitCommitsResponse {
  branch: string;
  branches: string[];
  commits: GitCommit[];
}

export interface GitDiffResponse {
  sha: string;
  message: string;
  diff: string;
  files_changed: string[];
  additions: number;
  deletions: number;
}

export interface AssignCommitRequest {
  board_name?: string;
  commit_sha?: string;
  title: string;
  description?: string;
  column?: string;
  priority?: string;
  agent_id?: string;
  files_context?: string[];
  acceptance_criteria?: string[];
}

export interface AssignCommitResponse {
  card_id: string;
  task_id?: string;
  board_name: string;
  agent_id?: string;
  title: string;
  status: string;
}

export interface AgentItem {
  id: string;
  name: string;
  role: string;
  status: string;
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

// Components are allowed to call `fetch("/api/...")` directly. In token mode
// (the desktop shell always sets one) those calls must be authenticated too,
// so wrap fetch once instead of chasing every call site.
const nativeFetch = window.fetch.bind(window);
window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const url =
    typeof input === "string" ? input : input instanceof URL ? input.toString() : null;
  if (url && url.startsWith("/api/") && !/[?&]token=/.test(url)) {
    return nativeFetch(withToken(url), init);
  }
  return nativeFetch(input as RequestInfo, init);
}) as typeof window.fetch;

let ws: WebSocket | null = null;

// Detect VS Code environment
export const isVscode = typeof (window as any).acquireVsCodeApi === "function";
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

export async function fetchGitCommits(branch?: string, limit?: number): Promise<GitCommitsResponse> {
  const params = new URLSearchParams();
  if (branch) params.set("branch", branch);
  if (limit) params.set("limit", limit.toString());
  const res = await fetch(withToken(`/api/git/commits?${params.toString()}`));
  if (!res.ok) throw new Error("Failed to fetch git commits");
  return res.json();
}

export async function fetchCommitDiff(sha: string): Promise<GitDiffResponse> {
  const res = await fetch(withToken(`/api/git/diff/${encodeURIComponent(sha)}`));
  if (!res.ok) throw new Error("Failed to fetch commit diff");
  return res.json();
}

export async function assignCommitToAgent(payload: AssignCommitRequest): Promise<AssignCommitResponse> {
  const res = await fetch(withToken("/api/git/assign"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || "Failed to assign commit task");
  }
  return res.json();
}

export async function fetchAgentsList(): Promise<{ agents: AgentItem[] }> {
  const res = await fetch(withToken("/api/agents"));
  if (!res.ok) throw new Error("Failed to fetch agents");
  return res.json();
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

// ── Liveness ──
// GET /api/ping is the one public /api route (an uptime monitor cannot hold a
// token). withToken() is harmless here — the query is simply ignored.
// The payload is dependency-free: no board/git reads, so a corrupt board can
// never make a live daemon look dead.
export interface PingResponse {
  status: string;
  timestamp: string;
  version: string;
  uptime_seconds: number;
}

export async function ping(): Promise<PingResponse> {
  const res = await fetch(withToken("/api/ping"));
  if (!res.ok) throw new Error(`ping failed: ${res.status}`);
  return res.json();
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

export async function fetchHistory(
  cardId?: string,
  limit?: number,
  boardName?: string
): Promise<HistoryEntry[]> {
  if (isVscode && vscodeApi) {
    return fetchHistoryVsCode(cardId);
  }
  try {
    const params = new URLSearchParams();
    if (cardId) params.set("card", cardId);
    if (limit) params.set("limit", String(limit));
    if (boardName) params.set("name", boardName);
    const qs = params.toString();
    const res = await fetch(withToken(`/api/history${qs ? `?${qs}` : ""}`));
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.entries) ? data.entries : [];
  } catch {
    return [];
  }
}

export async function fetchSessions(
  limit?: number,
  q?: string,
  agent?: string,
  cardId?: string,
  boardName?: string
): Promise<SessionEntry[]> {
  if (isVscode && vscodeApi) {
    return fetchSessionsVsCode();
  }
  try {
    const params = new URLSearchParams();
    if (limit) params.set("limit", String(limit));
    if (q) params.set("q", q);
    if (agent) params.set("agent", agent);
    if (cardId) params.set("card_id", cardId);
    if (boardName) params.set("name", boardName);
    const qs = params.toString() ? `?${params.toString()}` : "";
    const res = await fetch(withToken(`/api/sessions${qs}`));
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.sessions) ? data.sessions : [];
  } catch {
    return [];
  }
}

export async function fetchSessionStats(name?: string): Promise<{ total_sessions: number; total_files_touched: number; unique_agents: number; average_files_per_session: number } | null> {
  try {
    const qs = name ? `?name=${encodeURIComponent(name)}` : "";
    const res = await fetch(withToken(`/api/sessions/stats${qs}`));
    if (!res.ok) return null;
    const data = await res.json();
    if (data && typeof data.total_sessions === "number" && typeof data.average_files_per_session === "number") {
      return data;
    }
    return null;
  } catch {
    return null;
  }
}

export async function fetchAgenda(name?: string): Promise<{ board_name: string; today: string; overdue_count: number; today_count: number; upcoming_count: number; backlog_count: number; total_active: number } | null> {
  try {
    const qs = name ? `?name=${encodeURIComponent(name)}` : "";
    const res = await fetch(withToken(`/api/agenda${qs}`));
    if (!res.ok) return null;
    const data = await res.json();
    if (data && typeof data.today === "string") {
      return data;
    }
    return null;
  } catch {
    return null;
  }
}

export async function fetchReportsData(name?: string): Promise<{
  board_name: string;
  total_cards: number;
  completed_cards: number;
  in_progress_cards: number;
  blocked_cards: number;
  todo_cards: number;
  completion_rate: number;
  total_effort: number;
  completed_effort: number;
  by_priority: Record<string, number>;
  by_column: Record<string, number>;
} | null> {
  try {
    const qs = name ? `?name=${encodeURIComponent(name)}` : "";
    const res = await fetch(withToken(`/api/reports${qs}`));
    if (!res.ok) return null;
    const data = await res.json();
    if (data && typeof data.completion_rate === "number") {
      return data;
    }
    return null;
  } catch {
    return null;
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
  if (isDemoMode()) {
    // Demo mode (GitHub Pages / static hosting): no server to watch;
    // reloads come from the in-browser demo store instead.
    return onDemoChange(onReload);
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
  if (isDemoMode()) return Promise.resolve(getDemoCardHistory(cardId));
  if (isVscode && vscodeApi) {
    requestCardHistory(cardId);
    return new Promise((resolve) => {
      historyResolves.set(cardId, resolve);
    });
  }
  // Plain browser mode: fall back to the HTTP history endpoint.
  return fetchHistory(cardId, 50);
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

export async function openInEditor(
  path: string,
  line?: number,
  runId?: string,
  editor?: string
): Promise<{ opened: boolean; editor?: { name: string; id: string } } | null> {
  if (isVscode) {
    vscodeApi?.postMessage({ type: "openFile", path, line: line ?? 0 });
    return { opened: true };
  }
  return postJson("/api/open", { path, line, run_id: runId, editor });
}

export function openFileInEditor(path: string, line?: number) {
  if (isVscode) {
    vscodeApi?.postMessage({ type: "openFile", path, line: line ?? 0 });
    return;
  }
  void openInEditor(path, line);
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

export async function ingestMemory(name?: string): Promise<{ sessions_ingested: number; memories_added: number; consolidated: boolean } | null> {
  if (isVscode) return null;
  try {
    const params = new URLSearchParams();
    if (name) params.set("name", name);
    const res = await fetch(withToken(`/api/memory/ingest?${params.toString()}`), { method: "POST" });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

export async function consolidateMemory(name?: string): Promise<{ promoted: number; compressed: boolean; evicted: number } | null> {
  if (isVscode) return null;
  try {
    const params = new URLSearchParams();
    if (name) params.set("name", name);
    const res = await fetch(withToken(`/api/memory/consolidate?${params.toString()}`), { method: "POST" });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

// ── Context file API (living project_context.md) ──

export interface ContextFileBlock {
  id: string;
  heading: string;
  src: string;
  updated: string;
  staleness: number;
  manual: boolean;
  tokens: number;
  body: string;
}

export interface ContextFileResponse {
  exists: boolean;
  generated?: boolean;
  board: string;
  file?: string;
  content?: string;
  blocks?: ContextFileBlock[];
  total_tokens?: number;
  budget_tokens?: number;
  last_run?: string | null;
  evicted_last_run?: string[];
  hint?: string;
}

export interface DigestReport {
  regenerated: boolean;
  board: string;
  tokens: number;
  added: string[];
  rewritten: string[];
  evicted: string[];
  preserved_manual: string[];
  flagged_stale: string[];
}

export async function fetchContextFile(name?: string): Promise<ContextFileResponse | null> {
  if (isVscode) return null;
  try {
    const params = new URLSearchParams();
    if (name) params.set("name", name);
    const res = await fetch(withToken(`/api/context/file?${params.toString()}`));
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

export async function digestContextFile(name?: string, polish = false): Promise<DigestReport | null> {
  if (isVscode) return null;
  try {
    const params = new URLSearchParams();
    if (name) params.set("name", name);
    if (polish) params.set("polish", "1");
    const res = await fetch(withToken(`/api/context/file/digest?${params.toString()}`), { method: "POST" });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

// ── Brain API ──

export interface BrainNode {
  id: string;
  label: string;
  kind: "memory" | "fact" | "session" | "card" | "agent";
  tier?: string;
  importance: number;
  access_count: number;
  tags: string[];
  created_at: string;
}

export interface BrainEdge {
  from: string;
  to: string;
  kind: string;
  weight: number;
}

export async function fetchBrain(name?: string): Promise<{ nodes: BrainNode[]; edges: BrainEdge[] }> {
  if (isVscode) return { nodes: [], edges: [] };
  try {
    const params = new URLSearchParams();
    if (name) params.set("name", name);
    const res = await fetch(withToken(`/api/brain?${params.toString()}`));
    if (!res.ok) return { nodes: [], edges: [] };
    return await res.json();
  } catch { return { nodes: [], edges: [] }; }
}

export async function fetchBrainNode(id: string, name?: string): Promise<{ node: BrainNode; neighbors: BrainNode[] } | null> {
  if (isVscode) return null;
  try {
    const params = new URLSearchParams();
    if (name) params.set("name", name);
    const res = await fetch(withToken(`/api/brain/node/${encodeURIComponent(id)}?${params.toString()}`));
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
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

export async function submitIntent(text: string, kind?: string, name?: string, backend?: string, autoRun?: boolean): Promise<any | null> {
  return postJson("/api/intake", { text, kind, board: name, backend, auto_run: autoRun });
}

export async function createAndRunTask(payload: {
  title: string;
  description?: string;
  kind?: string;
  backend?: string;
  priority?: string;
  board?: string;
  acceptance_criteria?: string[];
}): Promise<any | null> {
  return postJson("/api/tasks/create-and-run", payload);
}

export async function cardPlanAndRun(cardId: string, backend?: string, name?: string): Promise<any | null> {
  return postJson(`/api/board/cards/${encodeURIComponent(cardId)}/plan-and-run`, { board: name, backend });
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

export async function fetchThreads(name?: string): Promise<ThreadSummary[]> {
  if (isVscode) return [];
  try {
    const qs = name ? `?name=${encodeURIComponent(name)}` : "";
    const res = await fetch(withToken(`/api/threads${qs}`));
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

export async function fetchThread(id: string, name?: string): Promise<ThreadDetail | null> {
  if (isVscode) return null;
  try {
    const qs = name ? `?name=${encodeURIComponent(name)}` : "";
    const res = await fetch(withToken(`/api/threads/${encodeURIComponent(id)}${qs}`));
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function createThread(payload: {
  text: string;
  kind?: string;
  backend?: string;
  mode?: string;
  board?: string;
}): Promise<any | null> {
  return postJson("/api/threads", payload);
}

export async function postThreadMessage(
  id: string,
  text: string,
  opts?: { author?: string; backend?: string; board?: string }
): Promise<ThreadEvent | null> {
  return postJson(`/api/threads/${encodeURIComponent(id)}/messages`, {
    text,
    author: opts?.author,
    backend: opts?.backend,
    board: opts?.board,
  });
}

export async function fetchSessionTranscript(
  sessionId: string,
  lines: number = 50
): Promise<SessionTranscript | null> {
  if (isVscode) return null;
  try {
    const res = await fetch(withToken(`/api/sessions/${encodeURIComponent(sessionId)}/transcript?lines=${lines}`));
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function fetchTaskDiff(taskId: string): Promise<TaskDiff | null> {
  if (isVscode) return null;
  try {
    const res = await fetch(withToken(`/api/tasks/${encodeURIComponent(taskId)}/diff`));
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export function streamThreadUrl(id: string, afterSeq?: number): string {
  const base = withToken(`/api/threads/${encodeURIComponent(id)}/stream`);
  if (afterSeq && afterSeq > 0) {
    return `${base}${base.includes("?") ? "&" : "?"}after_seq=${afterSeq}`;
  }
  return base;
}

export async function fetchProviders(): Promise<ProviderStatus[]> {
  if (isVscode) return [];
  try {
    const res = await fetch("/api/providers");
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

export async function probeProvider(id: string): Promise<ProviderStatus | null> {
  return postJson(`/api/providers/${encodeURIComponent(id)}/probe`, {});
}

export async function fetchThreadRuns(id: string): Promise<RunRecord[]> {
  if (isVscode) return [];
  try {
    const res = await fetch(`/api/threads/${encodeURIComponent(id)}/runs`);
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

export async function fetchRun(id: string): Promise<RunRecord | null> {
  if (isVscode) return null;
  try {
    const res = await fetch(`/api/runs/${encodeURIComponent(id)}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function startThreadRun(
  threadId: string,
  payload: {
    provider?: string;
    model?: string;
    role?: string;
    agent_id?: string;
    permission_mode?: string;
    prompt?: string;
    test_cmd?: string;
    parent_run_id?: string;
  }
): Promise<RunRecord | null> {
  return postJson(`/api/threads/${encodeURIComponent(threadId)}/runs`, payload);
}

export async function fetchRunDiff(runId: string): Promise<RunDiff | null> {
  if (isVscode) return null;
  try {
    const res = await fetch(`/api/runs/${encodeURIComponent(runId)}/diff`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function fetchRunGate(runId: string): Promise<RunGate | null> {
  if (isVscode) return null;
  try {
    const res = await fetch(`/api/runs/${encodeURIComponent(runId)}/gate`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function fetchRunContext(runId: string): Promise<RunContext | null> {
  if (isVscode) return null;
  try {
    const res = await fetch(`/api/runs/${encodeURIComponent(runId)}/context`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function previewContext(payload: {
  card_id: string;
  prompt?: string;
  role?: string;
  provider?: string;
  permission_mode?: string;
  skills?: string[];
  budget_tokens?: number;
}): Promise<ContextPack | null> {
  return postJson("/api/context/preview", payload);
}

export async function fetchDiscoveredSkills(): Promise<DiscoveredSkill[]> {
  if (isVscode) return [];
  try {
    const res = await fetch("/api/skills/discover");
    if (!res.ok) return [];
    const data = (await res.json()) as { skills?: DiscoveredSkill[] };
    return data.skills || [];
  } catch {
    return [];
  }
}

export async function importDiscoveredSkill(path: string): Promise<{ id: string; path: string } | null> {
  return postJson("/api/skills/discover/import", { path });
}

export async function stopRun(runId: string): Promise<RunRecord | null> {
  return postJson(`/api/runs/${encodeURIComponent(runId)}/stop`, {});
}

export async function mergeRun(runId: string, approved: boolean): Promise<any | null> {
  return postJson(`/api/runs/${encodeURIComponent(runId)}/merge`, { approved });
}

export async function stopSession(sessionId: string): Promise<any | null> {
  return postJson(`/api/sessions/${encodeURIComponent(sessionId)}/stop`, {});
}

export async function steerSession(sessionId: string, guidance: string): Promise<any | null> {
  return postJson(`/api/sessions/${encodeURIComponent(sessionId)}/steer`, { guidance });
}

export async function forkSession(sessionId: string): Promise<any | null> {
  return postJson(`/api/sessions/${encodeURIComponent(sessionId)}/fork`, {});
}

export async function raceTask(taskId: string, backendA?: string, backendB?: string): Promise<any | null> {
  return postJson(`/api/tasks/${encodeURIComponent(taskId)}/race`, {
    backend_a: backendA,
    backend_b: backendB,
  });
}

export async function evalSession(sessionId: string): Promise<any | null> {
  return postJson(`/api/sessions/${encodeURIComponent(sessionId)}/eval`, {});
}


// ---------------------------------------------------------------------------
// Product team & orchestra (M3)
// ---------------------------------------------------------------------------

export async function fetchRoles(): Promise<RoleDef[]> {
  if (isVscode) return [];
  try {
    const res = await fetch(withToken("/api/roles"));
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

export async function fetchAgentProfiles(): Promise<AgentProfile[]> {
  if (isVscode) return [];
  try {
    const res = await fetch(withToken("/api/agents/profiles"));
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

export async function saveAgentProfile(profile: AgentProfile): Promise<AgentProfile | null> {
  return postJson("/api/agents/profiles", profile);
}

export async function hireDefaultTeam(): Promise<AgentProfile[] | null> {
  const data = await postJson("/api/agents/profiles/default", {});
  return data?.profiles ?? null;
}

export async function setProfileStatus(id: string, status: ProfileStatus): Promise<AgentProfile | null> {
  return postJson(`/api/agents/profiles/${encodeURIComponent(id)}/status`, { status });
}

export async function fetchOrchestra(autoDispatch = false): Promise<OrchestraSnapshot | null> {
  if (isVscode) return null;
  try {
    const res = await fetch(withToken(`/api/orchestra?auto_dispatch=${autoDispatch ? "true" : "false"}`));
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function tickOrchestra(autoDispatch = true): Promise<OrchestraSnapshot | null> {
  return postJson("/api/orchestra/tick", { auto_dispatch: autoDispatch });
}

export async function createOrchestraPlan(cardId: string): Promise<ProductPlan | null> {
  return postJson("/api/orchestra/plans", { card_id: cardId });
}

export async function fetchOrchestraPlan(planId: string): Promise<ProductPlan | null> {
  if (isVscode) return null;
  try {
    const res = await fetch(withToken(`/api/orchestra/plans/${encodeURIComponent(planId)}`));
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function approveOrchestraPlan(planId: string): Promise<ProductPlan | null> {
  return postJson(`/api/orchestra/plans/${encodeURIComponent(planId)}/approve`, {});
}

export async function dispatchOrchestraPlan(planId: string): Promise<DispatchReport | null> {
  return postJson(`/api/orchestra/plans/${encodeURIComponent(planId)}/dispatch`, {});
}

export async function cancelOrchestraPlan(planId: string): Promise<ProductPlan | null> {
  return postJson(`/api/orchestra/plans/${encodeURIComponent(planId)}/cancel`, {});
}

export async function assignOrchestraTask(
  planId: string,
  taskId: string,
  agentId: string
): Promise<ProductPlan | null> {
  return postJson(
    `/api/orchestra/plans/${encodeURIComponent(planId)}/tasks/${encodeURIComponent(taskId)}/assign`,
    { agent_id: agentId }
  );
}

export async function fetchOrchestraAssignments(
  planId: string,
  taskId: string
): Promise<AssignmentRecommendation[]> {
  if (isVscode) return [];
  try {
    const res = await fetch(
      withToken(
        `/api/orchestra/plans/${encodeURIComponent(planId)}/tasks/${encodeURIComponent(taskId)}/assignments`
      )
    );
    if (!res.ok) return [];
    const data = (await res.json()) as { recommendations?: AssignmentRecommendation[] };
    return data.recommendations || [];
  } catch {
    return [];
  }
}

export async function retryOrchestraTask(
  planId: string,
  taskId: string
): Promise<{ plan: ProductPlan; report: DispatchReport } | null> {
  return postJson(
    `/api/orchestra/plans/${encodeURIComponent(planId)}/tasks/${encodeURIComponent(taskId)}/retry`,
    {}
  );
}

export async function answerOrchestraQuestion(
  planId: string,
  questionId: string,
  answer: string
): Promise<ProductPlan | null> {
  return postJson(
    `/api/orchestra/plans/${encodeURIComponent(planId)}/questions/${encodeURIComponent(questionId)}/answer`,
    { answer }
  );
}

export async function approveRun(
  runId: string,
  approved: boolean,
  note?: string,
  merge = false
): Promise<any | null> {
  return postJson(`/api/runs/${encodeURIComponent(runId)}/approve`, { approved, note, merge });
}

export async function answerRun(runId: string, text: string): Promise<any | null> {
  return postJson(`/api/runs/${encodeURIComponent(runId)}/answer`, { text });
}

// ---------------------------------------------------------------------------
// Review, repository, editor, and ship (M4)
// ---------------------------------------------------------------------------

export async function fetchReview(id: string): Promise<ReviewState | null> {
  if (isVscode) return null;
  try {
    const res = await fetch(withToken(`/api/reviews/${encodeURIComponent(id)}`));
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function markReviewViewed(
  id: string,
  path: string,
  viewed: boolean
): Promise<ReviewState | null> {
  return postJson(`/api/reviews/${encodeURIComponent(id)}/viewed`, { path, viewed });
}

export async function addReviewComment(
  id: string,
  payload: {
    path: string;
    line?: number;
    side?: string;
    body: string;
    run_id?: string;
  }
): Promise<ReviewComment | null> {
  return postJson(`/api/reviews/${encodeURIComponent(id)}/comments`, payload);
}

export async function resolveReviewComment(
  id: string,
  commentId: string,
  resolved: boolean
): Promise<ReviewComment | null> {
  return postJson(
    `/api/reviews/${encodeURIComponent(id)}/comments/${encodeURIComponent(commentId)}/resolve`,
    { resolved }
  );
}

export async function deleteReviewComment(
  id: string,
  commentId: string
): Promise<boolean> {
  if (isVscode) return false;
  try {
    const res = await fetch(
      withToken(
        `/api/reviews/${encodeURIComponent(id)}/comments/${encodeURIComponent(commentId)}`
      ),
      { method: "DELETE" }
    );
    return res.ok;
  } catch {
    return false;
  }
}

export async function requestRunChanges(
  runId: string,
  note?: string
): Promise<{ run?: RunRecord; comments?: number } | null> {
  return postJson(`/api/runs/${encodeURIComponent(runId)}/request-changes`, { note });
}

export async function askAboutRun(
  runId: string,
  question: string,
  path?: string,
  line?: number
): Promise<{ run?: RunRecord } | null> {
  return postJson(`/api/runs/${encodeURIComponent(runId)}/ask`, {
    question,
    path,
    line,
  });
}

export async function detectEditors(): Promise<EditorDetection | null> {
  if (isVscode) return null;
  try {
    const res = await fetch(withToken("/api/editor/detect"));
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function fetchRepoTree(
  path = ".",
  depth = 4
): Promise<{ root: string; entries: RepoEntry[] } | null> {
  if (isVscode) return null;
  try {
    const params = new URLSearchParams({ path, depth: String(depth) });
    const res = await fetch(withToken(`/api/repo/tree?${params}`));
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function fetchRepoFile(path: string): Promise<RepoFile | null> {
  if (isVscode) return null;
  try {
    const params = new URLSearchParams({ path });
    const res = await fetch(withToken(`/api/repo/file?${params}`));
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function fetchGitStatus(): Promise<GitStatus | null> {
  if (isVscode) return null;
  try {
    const res = await fetch(withToken("/api/git/status"));
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function gitCommit(
  message: string,
  paths: string[] = [],
  cardId?: string
): Promise<{ sha: string; message: string; files: string[] } | null> {
  return postJson("/api/git/commit", { message, paths, card_id: cardId });
}

export async function gitPush(
  options: { remote?: string; branch?: string; dryRun?: boolean; confirm?: boolean } = {}
): Promise<any | null> {
  return postJson("/api/git/push", {
    remote: options.remote,
    branch: options.branch,
    dry_run: options.dryRun ?? false,
    confirm: options.confirm ?? false,
  });
}

export async function gitMerge(
  branch: string,
  message?: string,
  confirm = false
): Promise<any | null> {
  return postJson("/api/git/merge", { branch, message, confirm });
}

export async function gitCreatePr(options: {
  title: string;
  body?: string;
  base?: string;
  draft?: boolean;
  dryRun?: boolean;
  confirm?: boolean;
}): Promise<any | null> {
  return postJson("/api/git/pr", {
    title: options.title,
    body: options.body,
    base: options.base,
    draft: options.draft ?? false,
    dry_run: options.dryRun ?? false,
    confirm: options.confirm ?? false,
  });
}

export async function fetchWorktrees(): Promise<WorktreeInfo[] | null> {
  if (isVscode) return null;
  try {
    const res = await fetch(withToken("/api/git/worktrees"));
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
