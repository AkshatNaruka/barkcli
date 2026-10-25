// ── Demo API layer ──
// GitHub Pages (and any static host) has no `barkcli serve` backend, so
// without a data source the web app would render an error and every view
// would be empty. When this app is NOT talking to a live server, we
// intercept all `/api/*` fetches and serve a rich, self-contained demo
// session instead:
//
//   • real repo boards, sprints, specs, memory, agents, docs…
//   • every mutation the UI makes (card CRUD, board create, sprints,
//     memory, orchestration, autopilot gates…) is fully interactive
//     and persists in the browser's localStorage — no backend, no cloud.
//
// Activation: `*.github.io` hosts, `file://` protocol, `?demo=1`
// (`?demo=0` disables, `?demo=reset` resets the demo data).
// When a real server IS reachable (normal `barkcli serve` usage) this
// layer stays completely dormant — zero behavioral change.

import { load as yamlParse, dump as yamlDump } from "js-yaml";
import { isReplayMode, replaySessions, replayTaskStatus } from "./replay";
import type {
  Board,
  Card,
  CardContext,
  HistoryEntry,
  MemoryEntry,
  ProjectFact,
  SessionEntry,
  Sprint,
} from "./types";

// Real repo docs, served by the Docs tab exactly like `barkcli serve` would.
// Content is lazy-imported so docs only load when the Docs tab is opened.
const DOC_GLOB = import.meta.glob("../../../docs/content/*.md", { query: "?raw", import: "default" }) as Record<string, () => Promise<string>>;

const DOCS = Object.keys(DOC_GLOB).map((path) => {
  const file = (path.split("/").pop() || "").replace(/\.md$/, "");
  return { slug: file, title: file.replace(/_/g, " ") };
});

async function readDoc(slug: string): Promise<string | null> {
  const entry = Object.entries(DOC_GLOB).find(([path]) => path.endsWith(`/${slug}.md`));
  return entry ? entry[1]() : null;
}

export function isDemoMode(): boolean {
  try {
    const q = new URLSearchParams(window.location.search);
    const flag = q.get("demo");
    if (flag === "1") { localStorage.setItem("barkcli-demo", "1"); return true; }
    if (flag === "0") { localStorage.removeItem("barkcli-demo"); return false; }
    if (flag === "reset") { localStorage.removeItem(STORE_KEY); location.reload(); return true; }
    if (localStorage.getItem("barkcli-demo") === "1") return true;
    if (window.location.protocol === "file:") return true;
    if (window.location.hostname.endsWith(".github.io")) return true;
  } catch { /* non-browser env */ }
  return false;
}

// ── Store shape ──

interface AgentRec {
  id: string; name: string; role: string; status: string;
  active_tasks: string[]; completed_tasks: string[]; failed_tasks: string[];
}
interface TaskRec {
  id: string; card_id: string; title: string; description: string;
  status: string; assigned_agent?: string; priority: string; created_at: string;
}
interface BundleRec {
  id: string; title: string; kind: string; status: string; branch: string;
  commit_count: number; first_sha: string | null; last_sha: string | null;
  confidence: number; card_id: string | null; summary?: string;
  commits?: Array<{ sha: string; subject: string; author: string; date: string }>;
}
interface SkillRec {
  id: string; name: string; description: string; triggers: string[]; source: string; content?: string;
}
interface RequirementRec {
  id: string; title: string; description?: string; status: string;
  acceptance_criteria: string[]; linked_code: string[]; linked_tests: string[];
  linked_tasks: string[]; stale: boolean; stale_reason?: string; updated_at: string;
}
interface SpecRec {
  id: string; title: string; description?: string; status: string; priority: string;
  requirements: RequirementRec[]; tags: string[]; created_at: string; updated_at: string;
}
interface CheckpointRec {
  kind: string; id: string; saved_at: string; label: string; board_name: string; yaml?: string;
}
export interface PlanProposal {
  card_id: string; card_title: string; proposed_at: string; proposed_by: string;
  requirements: { title: string; acceptance_criteria: string[]; effort: number }[];
  children: { title: string; description: string; priority: string; effort: number; labels: string[]; acceptance_criteria: string[] }[];
  estimated_total_effort: number; risk_level: string; rationale: string;
}
interface DemoStore {
  boardNames: string[];
  boards: Record<string, Board>;
  sprints: Sprint[];
  memory: MemoryEntry[];
  facts: ProjectFact[];
  sessions: SessionEntry[];
  history: HistoryEntry[];
  agents: AgentRec[];
  tasks: TaskRec[];
  checkpoints: CheckpointRec[];
  skills: SkillRec[];
  bundles: BundleRec[];
  specs: SpecRec[];
  orch: { cycle_count: number; tasks_dispatched: number; tasks_completed: number; tasks_failed: number };
  pendingProposal: PlanProposal | null;
  undoStack: Record<string, string[]>;
}

const STORE_KEY = "barkcli-demo-v2";
let store: DemoStore | null = null;

// Relative dates keep the demo board alive on every visit.
const d = (days: number) => new Date(Date.now() - days * 86400000).toISOString();
const h = (hours: number) => new Date(Date.now() - hours * 3600000).toISOString();
const inDays = (days: number) => new Date(Date.now() + days * 86400000).toISOString();

// ── Card/board helpers ──

function card(s: Partial<Card> & { id: string; title: string; column: string }): Card {
  return {
    priority: "medium", labels: [], checklist: [], comments: [], attachments: [], links: [],
    acceptance_criteria: [], pinned: false, description: "", created_at: d(14), updated_at: h(20),
    ...s,
  };
}

function emptyBoard(title: string, columns: string[]): Board {
  return {
    title,
    columns: columns.map((id) => ({ id, name: id[0].toUpperCase() + id.slice(1) })),
    cards: [],
  } as Board;
}

function isBlocked(c: Card): boolean {
  return Boolean(c.blocked_by) || c.links.some((l) => l.ty === "blocked-by");
}

// ── Seed data ──

function seedBoards(): Record<string, Board> {
  const dev = emptyBoard("barkcli — dev board", ["todo", "doing", "review", "done"]);
  dev.description = "The management layer for AI agents — CLI, TUI, web and VS Code from one binary.";
  dev.cards = [
    // The OAuth workstream — the board's live story (matches the Mind page).
    card({
      id: "add-oauth", title: "Add OAuth login", column: "todo", priority: "high",
      labels: ["auth"], effort: 3, area: "web", spec_id: "sso",
      description: "Sign in with GitHub / Google behind the sso spec — provider adapters, redirect round-trip, session bootstrap.",
      acceptance_criteria: ["Callback round-trips without a 500", "Session cookie set on success"],
      updated_at: h(3), created_at: d(4),
    }),
    card({
      id: "fix-checkout", title: "Fix checkout crash", column: "todo", priority: "high",
      labels: ["bug"], effort: 2, area: "web", spec_id: "checkout",
      blocked_by: "oauth-flow",
      description: "Nil unwrap on an unauthenticated cart crashes the buy flow; guard lands with the OAuth branch.",
      acceptance_criteria: ["Regression test on anonymous cart", "Crash no longer reproducible"],
      updated_at: h(6), created_at: d(6),
    }),
    card({
      id: "autopilot-gates", title: "Autopilot human gates", column: "todo", priority: "high",
      labels: ["smart", "orchestrate"], effort: 5, area: "smart", spec_id: "autopilot",
      blocked_by: "oauth-flow",
      description: "Agents work card-by-card; humans approve at phase gates (plan, review, merge).",
      acceptance_criteria: ["Plan approval happens in the web UI", "Every gate also runs from the CLI"],
      links: [{ ty: "parent", target: "autopilot-intake" }],
      updated_at: h(14), created_at: d(18),
    }),
    card({
      id: "tui-mouse-scroll", title: "Mouse wheel scrolling in TUI", column: "todo", priority: "low",
      labels: ["tui"], effort: 1, area: "tui",
      description: "Column panels should scroll with the wheel without leaving selection mode.",
      updated_at: d(9), created_at: d(60),
    }),
    card({
      id: "oauth-flow", title: "Implement OAuth flow", column: "doing", priority: "high",
      labels: ["auth"], effort: 5, area: "web", spec_id: "sso",
      description: "Wiring the redirect round-trip: authorize URL, code exchange, and the first session write.",
      checklist: [
        { text: "Authorize request builds state + nonce", done: true },
        { text: "Token exchange endpoint stubbed", done: true },
        { text: "Session cookie write", done: false },
      ],
      updated_at: h(1), created_at: d(8),
    }),
    card({
      id: "demo-hosting", title: "Static demo hosting", column: "doing", priority: "high",
      labels: ["web", "server"], effort: 3, area: "web", pinned: true,
      description: "Serve the web app on a static host behind an in-browser demo API — writes persist to localStorage.",
      checklist: [
        { text: "Detect static hosting automatically", done: true },
        { text: "Serve boards, sprints, memory, specs, docs", done: true },
        { text: "Keep every write interactive (no backend)", done: true },
      ],
      links: [{ ty: "related", target: "kiosk-mode" }],
      updated_at: h(2), created_at: d(9),
    }),
    card({
      id: "store-tokens", title: "Store tokens securely", column: "review", priority: "medium",
      labels: ["auth", "memory"], effort: 2, area: "web", spec_id: "sso",
      description: "Refresh tokens in the OS keychain (not .board files), rotation on refresh, revocation on logout.",
      acceptance_criteria: ["No token ever hits the YAML", "Keychain read/write on all three OSes"],
      updated_at: h(4), created_at: d(7),
    }),
    card({
      id: "share-links", title: "Shareable card permalinks", column: "review", priority: "low",
      labels: ["web"], effort: 1, area: "web",
      description: "#board/<card> hash routes that open the card form directly from a URL.",
      updated_at: h(9), created_at: d(15),
    }),
    card({
      id: "kiosk-mode", title: "Kiosk mode for wall displays", column: "done", priority: "high",
      labels: ["web"], effort: 3, area: "web",
      links: [{ ty: "related", target: "demo-mode" }],
      checklist: [{ text: "Hide chrome + autoscroll board", done: true }],
      updated_at: h(6), created_at: d(16),
    }),
    card({
      id: "card-crud", title: "Card CRUD", column: "done", priority: "high",
      labels: ["cli"], effort: 3, description: "Add, list, show, update, remove cards.",
      comments: [{ author: "max", text: "shipped in 0.5.0", at: d(4) }],
      updated_at: d(4), created_at: d(45),
    }),
    card({
      id: "burndown-chart", title: "Sprint burndown + effort reports", column: "done", priority: "medium",
      labels: ["web", "reports"], effort: 2, description: "Burndown per sprint with effort estimates.",
      updated_at: d(5), created_at: d(35),
    }),
    card({
      id: "memory-tiers", title: "Memory tiers working → long_term", column: "done", priority: "medium",
      labels: ["memory"], effort: 3, description: "Decay + consolidation promote hot memories, evict the rest.",
      updated_at: d(6), created_at: d(40),
    }),
    card({
      id: "skill-registry", title: "Skills registry in .board/", column: "done", priority: "low",
      labels: ["orchestrate"], effort: 2, description: "BMAD-style skills served to agents via /api/skills.",
      updated_at: d(7), created_at: d(50),
    }),
    card({
      id: "history-bundles", title: "History Bundles v0.7", column: "done", priority: "high",
      labels: ["cli", "smart"], effort: 5, area: "smart", spec_id: "bundles",
      description: "Group related commits into reviewable bundles and map them to cards.",
      checklist: [
        { text: "Scan git log into bundle candidates", done: true },
        { text: "Approve/reject/seal flow", done: true },
        { text: "Card ⇄ bundle linkage on board", done: true },
      ],
      acceptance_criteria: ["Scan runs without a remote", "Bundles survive re-scan (stable ids)"],
      comments: [{ author: "max", text: "shipped in 0.7.0", at: d(3) }],
      updated_at: d(3), created_at: d(21),
    }),
    card({
      id: "ws-live-reload", title: "WebSocket live reload", column: "done", priority: "medium",
      labels: ["web", "serve"], effort: 2, area: "serve",
      description: "Push file changes to the browser over /ws; skip reloads caused by our own debounced saves.",
      updated_at: d(10), created_at: d(12),
    }),
    card({
      id: "autopilot-intake", title: "Plain-language intent intake", column: "done", priority: "medium",
      labels: ["smart"], effort: 2, area: "smart",
      description: "One text box: 'Add Google OAuth' → proposes a card with acceptance criteria.",
      updated_at: d(11), created_at: d(10),
    }),
    card({
      id: "brain-view-polish", title: "Brain graph polish", column: "done", priority: "medium",
      labels: ["web", "memory"], effort: 2, area: "web",
      description: "Auto layout, minimap search focus, and connected-node inspector for the memory graph.",
      updated_at: d(12), created_at: d(20),
    }),
    card({
      id: "calendar-remind", title: "Calendar reminders in web + TUI", column: "done", priority: "medium",
      labels: ["web", "tui"], effort: 3,
      description: "remind_at fires a toast in the web app and a line in the TUI agenda.",
      updated_at: d(13), created_at: d(30),
    }),
    card({
      id: "vscode-sync-review", title: "VS Code: review card diff before save", column: "done", priority: "medium",
      labels: ["vscode"], effort: 2, area: "vscode",
      description: "Show a diff preview tree-side before writing YAML back to the board file.",
      updated_at: d(14), created_at: d(28),
    }),
  ];

  const roadmap = emptyBoard("Roadmap — 2026", ["idea", "planned", "shipped"]);
  roadmap.cards = [
    card({ id: "rm-server-mode", title: "Headless serve mode (systemd unit)", column: "planned", priority: "high", labels: ["serve"], updated_at: d(1), created_at: d(20) }),
    card({ id: "rm-multi-repo", title: "Multi-repo memory hub", column: "idea", priority: "medium", labels: ["memory"], updated_at: d(2), created_at: d(15) }),
    card({ id: "rm-agent-skills", title: "Publish agent skill packs", column: "idea", priority: "low", labels: ["orchestrate"], updated_at: d(5), created_at: d(12) }),
    card({ id: "rm-tui-themes", title: "TUI theme pack", column: "shipped", priority: "low", labels: ["tui"], updated_at: d(8), created_at: d(25) }),
  ];
  return { dev, roadmap };
}

function seed(): DemoStore {
  const boards = seedBoards();
  return {
    boardNames: ["dev", "roadmap"],
    boards,
    sprints: [
      { name: "sprint-14", start: d(6).slice(0, 10), end: inDays(8).slice(0, 10), created_at: d(6) },
      { name: "sprint-13", start: d(20).slice(0, 10), end: d(7).slice(0, 10), created_at: d(20) },
    ],
    memory: [
      { id: "mem-1", content: "Board YAML is the source of truth — the web app saves the whole board via PUT /api/board, never per-card writes.", tier: "long_term", tags: ["architecture"], source: "AIDER", created_at: d(30), last_accessed: d(1), access_count: 12, importance: 0.9 },
      { id: "mem-2", content: "Board server default port is 4321 (deliberately avoids Vite/Next on :3000).", tier: "long_term", tags: ["serve"], source: "AGENTS", created_at: d(28), last_accessed: d(2), access_count: 9, importance: 0.7 },
      { id: "mem-3", content: "Agent sessions live in .board/sessions.jsonl; history bundles scan distills them into reviewable commits.", tier: "short_term", tags: ["smart"], source: "SESSION", created_at: d(3), last_accessed: d(0), access_count: 4, importance: 0.5 },
      { id: "mem-4", content: "Sprint burndown uses the effort field; cards without effort count as 1 point.", tier: "short_term", tags: ["reports"], source: "SESSION", created_at: d(5), last_accessed: d(1), access_count: 3, importance: 0.4 },
      { id: "mem-5", content: "User prefers handoff summaries printed to stdout, not opened in an editor.", tier: "working", tags: ["workflow"], source: "SESSION", created_at: d(0), last_accessed: d(0), access_count: 6, importance: 0.6 },
      { id: "mem-6", content: "External: design color system is brown/amber accent on near-black surfaces.", tier: "external", tags: ["design"], source: "URL", created_at: d(60), last_accessed: d(10), access_count: 2, importance: 0.3 },
    ],
    facts: [
      { fact: "barkcli is written in Rust; the web app is React + Vite in web/.", category: "architecture", confidence: 1.0, sources: ["AGENTS.md"], created_at: d(45) },
      { fact: "All kanban state lives in <name>.board YAML files next to the code.", category: "data", confidence: 0.95, sources: ["README.md"], created_at: d(40) },
      { fact: "The web app derives all card mutations client-side, then persists via PUT /api/board.", category: "architecture", confidence: 0.9, sources: ["web/src/App.tsx"], created_at: d(20) },
      { fact: "Fibonacci efforts (1,2,3,5) map to report points.", category: "process", confidence: 0.8, sources: ["docs"], created_at: d(15) },
    ],
    sessions: [
      { id: "ses-1", agent: "opencode-1", model: "opencode", board: "dev", prompt: "Implement the OAuth flow card", commit_sha: "a1d9c02", files_touched: ["web/src/lib/auth.ts", "web/src/App.tsx"], summary: "Redirect round-trip: authorize URL builds state+nonce, exchange endpoint stubbed.", at: h(1), duration_ms: 1120000 },
      { id: "ses-2", agent: "claude-2", model: "claude-sonnet-4-5", board: "dev", prompt: "Store tokens securely card", files_touched: ["web/src/lib/auth.ts"], summary: "Keychain-backed token cache reviewed; rotation ready for sign-off.", at: h(2), duration_ms: 640000 },
      { id: "ses-3", agent: "human-you", board: "dev", prompt: "Review the review queue", files_touched: ["dev.board"], summary: "Reviewing Store tokens securely — 2 acceptance criteria checked, 1 open.", at: h(3), duration_ms: 180000 },
      { id: "ses-4", agent: "orbiter", model: "claude-sonnet-4-5", board: "dev", prompt: "Implement kiosk mode for wall displays", commit_sha: "9f4bd21", files_touched: ["web/src/components/BoardView.tsx", "web/src/App.tsx"], summary: "Kiosk mode hides chrome, auto-scrolls board columns, 10s refresh.", at: h(6), duration_ms: 1420000 },
      { id: "ses-5", agent: "orbiter", model: "claude-sonnet-4-5", board: "dev", prompt: "Wire memory tiers + consolidation decay", commit_sha: "7ca15f9", files_touched: ["barkcli-core/src/memory.rs"], summary: "Decay scheduler promotes hot memories to long_term every 24h.", at: d(6), duration_ms: 950000 },
      { id: "ses-6", agent: "scrum-master-1", board: "dev", prompt: "Weekly board grooming", files_touched: ["dev.board"], summary: "Closed 3 stale cards, promoted 2 into doing.", at: d(7), duration_ms: 210000 },
      { id: "ses-7", agent: "builder-7", model: "gpt-5.2", board: "roadmap", prompt: "Draft 2026 roadmap slices", files_touched: ["roadmap.board"], summary: "Roadmap board created with 4 seeded initiatives.", at: d(8), duration_ms: 640000 },
    ],
    history: [
      { op: "move", board: "dev", card: "demo-mode", old_value: "todo", new_value: "doing", at: h(2) },
      { op: "add", board: "roadmap", card: "rm-multi-repo", new_value: "idea", at: d(2) },
      { op: "update", board: "dev", card: "calendar-remind", field: "due_date", new_value: inDays(5).slice(0, 10), at: d(2) },
      { op: "move", board: "dev", card: "history-bundles", old_value: "todo", new_value: "doing", at: d(1) },
      { op: "comment", board: "dev", card: "history-bundles", new_value: "Bundle scan missed squash merges…", at: h(30) },
      { op: "update", board: "dev", card: "ws-live-reload", field: "labels", old_value: "web", new_value: "web, serve", at: h(5) },
      { op: "move", board: "dev", card: "kiosk-mode", old_value: "review", new_value: "done", at: h(6) },
      { op: "add", board: "dev", card: "vscode-sync-review", new_value: "todo", at: d(3) },
      { op: "close", board: "dev", card: "burndown-chart", new_value: "done", at: d(5) },
      { op: "add", board: "dev", card: "demo-mode", new_value: "doing", at: d(9) },
    ],
    agents: [
      { id: "opencode-1", name: "opencode-1", role: "TechLead", status: "Working", active_tasks: ["task-1"], completed_tasks: ["task-6"], failed_tasks: [] },
      { id: "claude-2", name: "claude-2", role: "Developer", status: "Working", active_tasks: ["task-2"], completed_tasks: [], failed_tasks: [] },
      { id: "codex-1", name: "codex-1", role: "Developer", status: "Working", active_tasks: ["task-8"], completed_tasks: [], failed_tasks: [] },
      { id: "human-you", name: "human-you", role: "Reviewer", status: "Working", active_tasks: ["task-3"], completed_tasks: [], failed_tasks: [] },
      { id: "scrum-master-1", name: "Scrum Master", role: "ScrumMaster", status: "Idle", active_tasks: [], completed_tasks: ["task-7"], failed_tasks: [] },
    ],
    tasks: [
      { id: "task-1", card_id: "oauth-flow", title: "OAuth flow", description: "Drive the Implement OAuth flow card: redirect round-trip, token exchange, session write.", status: "InProgress", assigned_agent: "opencode-1", priority: "high", created_at: d(1) },
      { id: "task-2", card_id: "store-tokens", title: "Token storage", description: "Keychain-backed token storage hardening for the sso spec.", status: "InProgress", assigned_agent: "claude-2", priority: "medium", created_at: d(1) },
      { id: "task-3", card_id: "store-tokens", title: "Review queue", description: "Human review gate for the store-tokens slice.", status: "InProgress", assigned_agent: "human-you", priority: "medium", created_at: h(4) },
      { id: "task-4", card_id: "add-oauth", title: "Add OAuth login", description: "Slice add-oauth once the flow branch lands.", status: "Pending", priority: "high", created_at: h(2) },
      { id: "task-5", card_id: "autopilot-gates", title: "Design human gate flow", description: "Gated dispatch after the OAuth workstream clears.", status: "Pending", priority: "high", created_at: h(3) },
      { id: "task-6", card_id: "kiosk-mode", title: "Finish kiosk renderer", description: "Ship chrome-less fullscreen board mode.", status: "Completed", assigned_agent: "opencode-1", priority: "high", created_at: d(3) },
      { id: "task-7", card_id: "brain-view-polish", title: "Groom the board", description: "Weekly board grooming pass.", status: "Completed", assigned_agent: "scrum-master-1", priority: "medium", created_at: d(4) },
      { id: "task-8", card_id: "add-oauth", title: "OAuth callback tests", description: "Regression coverage for the callback round-trip before the flow merges.", status: "InProgress", assigned_agent: "codex-1", priority: "high", created_at: h(1) },
    ],
    checkpoints: [
      { kind: "checkpoint", id: "cp-seed-1", saved_at: d(3), label: "before-bundle-prune", board_name: "dev", yaml: yamlDump(boards.dev, { indent: 2, lineWidth: -1 }) },
      { kind: "checkpoint", id: "cp-seed-2", saved_at: d(7), label: "sprint-13-end", board_name: "dev", yaml: yamlDump(boards.dev, { indent: 2, lineWidth: -1 }) },
    ],
    skills: [
      { id: "dev", name: "developer", description: "Feature developer: spec → slices → build loop", triggers: ["build", "implement"], source: ".board/skills/dev.md", content: "# Developer\n\nDrive cards in `doing` to completion: read acceptance criteria, code, then request review." },
      { id: "scrum-master", name: "scrum-master", description: "Board grooming, sprint ops, orchestration cycles", triggers: ["groom", "sprint"], source: ".board/skills/scrum-master.md", content: "# Scrum Master\n\nKeep columns flowing: board grooming, sprint start/end, orchestrate cycles." },
      { id: "sm-designer", name: "sm-designer", description: "Design a new screen from intent", triggers: ["design"], source: ".board/skills/sm-designer.md" },
      { id: "rememberer", name: "rememberer", description: "Post-task: distill what changed into memories", triggers: ["remember"], source: ".board/skills/rememberer.md" },
      { id: "sm-pm", name: "sm-pm", description: "Draft specs, requirements, PR description", triggers: ["spec", "docs"], source: ".board/skills/sm-pm.md" },
      { id: "reviewer", name: "reviewer", description: "Score and review ready cards", triggers: ["review"], source: ".board/skills/reviewer.md" },
    ],
    bundles: [
      {
        id: "bundle-1", title: "Kiosk mode for wall displays", kind: "feature", status: "sealed", branch: "feat/kiosk",
        commit_count: 4, first_sha: "3aa91c7", last_sha: "9f4bd21", confidence: 0.92, card_id: "kiosk-mode",
        summary: "Fullscreen chrome-less board with auto-scroll.",
        commits: [
          { sha: "3aa91c7", subject: "feat(web): kiosk toggle in top bar", author: "orbiter", date: d(3) },
          { sha: "41cd905", subject: "feat(web): auto-scroll column presets", author: "orbiter", date: d(3) },
          { sha: "77b2e10", subject: "fix(web): pause scroll on hover", author: "you", date: d(2) },
          { sha: "9f4bd21", subject: "docs: kiosk mode notes", author: "you", date: d(2) },
        ],
      },
      {
        id: "bundle-2", title: "WebSocket live reload", kind: "fix", status: "pending", branch: "fix/ws-reload",
        commit_count: 2, first_sha: "6b5510f", last_sha: "d91cc88", confidence: 0.71, card_id: "ws-live-reload",
        summary: "Skip reloads caused by our own debounced saves.",
        commits: [
          { sha: "6b5510f", subject: "fix(web): tag own reload versions", author: "you", date: d(0) },
          { sha: "d91cc88", subject: "fix(serve): debounce 1.5s window", author: "you", date: d(0) },
        ],
      },
      {
        id: "bundle-3", title: "Memory tier consolidation", kind: "chore", status: "approved", branch: "feat/memory-tiers",
        commit_count: 3, first_sha: "082ff2e", last_sha: "7ca15f9", confidence: 0.85, card_id: "memory-tiers",
        commits: [
          { sha: "082ff2e", subject: "feat(memory): decay scheduler", author: "orbiter", date: d(6) },
          { sha: "be421aa", subject: "feat(memory): promote + evict", author: "orbiter", date: d(6) },
          { sha: "7ca15f9", subject: "test: consolidation cases", author: "you", date: d(5) },
        ],
      },
    ],
    specs: [
      {
        id: "bundles", title: "History Bundles", status: "in-progress", priority: "high",
        description: "Distill agent history into reviewable, card-linked bundles.",
        tags: ["smart", "cli"], created_at: d(30), updated_at: h(30),
        requirements: [
          { id: "req-1", title: "Scan git log into bundles", status: "implemented", acceptance_criteria: ["Runs offline", "Stable ids under re-scan"], linked_code: ["barkcli-core/src/history.rs"], linked_tests: ["barkcli-core/tests/bundles.rs"], linked_tasks: [], stale: false, updated_at: d(6) },
          { id: "req-2", title: "Approve / reject / seal lifecycle", status: "in-progress", acceptance_criteria: ["Sealed bundles are immutable"], linked_code: ["barkcli-server/src/lib.rs"], linked_tests: [], linked_tasks: [], stale: false, updated_at: h(30) },
          { id: "req-3", title: "Squash-merge detection", status: "pending", acceptance_criteria: ["95% recall on sample repo"], linked_code: [], linked_tests: [], linked_tasks: [], stale: true, stale_reason: "Card changed hands; re-triage before work", updated_at: d(2) },
        ],
      },
      {
        id: "autopilot", title: "Autopilot phases", status: "draft", priority: "high",
        description: "Card-by-card agent loop with human gates at plan/review/merge.",
        tags: ["smart", "orchestrate"], created_at: d(12), updated_at: h(14),
        requirements: [
          { id: "req-4", title: "Phase machine with human prompts", status: "in-progress", acceptance_criteria: ["Gate rendered in web UI", "CLI equivalent exits non-zero when blocked"], linked_code: ["barkcli-core/src/autopilot.rs"], linked_tests: [], linked_tasks: ["task-5"], stale: false, updated_at: h(14) },
          { id: "req-5", title: "Intent intake normalizer", status: "pending", acceptance_criteria: ["One sentence → draft card"], linked_code: [], linked_tests: [], linked_tasks: [], stale: false, updated_at: d(2) },
          { id: "req-6", title: "Reviewer pass scoring", status: "pending", acceptance_criteria: [], linked_code: [], linked_tests: [], linked_tasks: [], stale: false, updated_at: d(2) },
        ],
      },
      {
        id: "sso", title: "Single sign-on (OAuth)", status: "in-progress", priority: "high",
        description: "Provider-backed sign-in: redirect round-trip, token exchange, secure token storage.",
        tags: ["auth", "web"], created_at: d(8), updated_at: h(1),
        requirements: [
          { id: "req-7", title: "OAuth redirect round-trip", status: "in-progress", acceptance_criteria: ["State + nonce validated", "Callback never 500s"], linked_code: ["web/src/lib/auth.ts"], linked_tests: [], linked_tasks: ["task-1"], stale: false, updated_at: h(1) },
          { id: "req-8", title: "Tokens live in the OS keychain", status: "in-progress", acceptance_criteria: ["No token in board YAML", "Rotation on refresh"], linked_code: ["web/src/lib/auth.ts"], linked_tests: [], linked_tasks: ["task-2", "task-3"], stale: false, updated_at: h(2) },
          { id: "req-9", title: "GitHub + Google providers", status: "pending", acceptance_criteria: ["Feature-flagged provider list"], linked_code: [], linked_tests: [], linked_tasks: [], stale: false, updated_at: d(2) },
        ],
      },
      {
        id: "checkout", title: "Checkout flow", status: "draft", priority: "high",
        description: "Buy path hardening: anonymous cart guard and crash-free checkout.",
        tags: ["web", "reliability"], created_at: d(6), updated_at: h(6),
        requirements: [
          { id: "req-10", title: "Anonymous cart guard", status: "pending", acceptance_criteria: ["Regression test on anonymous cart", "Crash no longer reproducible"], linked_code: [], linked_tests: [], linked_tasks: [], stale: false, updated_at: h(6) },
        ],
      },
    ],
    orch: { cycle_count: 12, tasks_dispatched: 18, tasks_completed: 14, tasks_failed: 1 },
    pendingProposal: null,
    undoStack: {},
  };
}

function getStore(): DemoStore {
  if (!store) {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) store = JSON.parse(raw) as DemoStore;
    } catch { store = null; }
    if (!store) {
      store = seed();
      persist();
    }
  }
  return store!;
}

function persist() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch { /* quota full — demo stays in memory */ }
}

// ── Change notifications (replaces WebSocket reloads while demo) ──

let changeListeners: ((version: number) => void)[] = [];

export function onDemoChange(cb: (version: number) => void): () => void {
  changeListeners.push(cb);
  return () => { changeListeners = changeListeners.filter((c) => c !== cb); };
}

function emitChange() {
  const v = Date.now();
  changeListeners.forEach((c) => { try { c(v); } catch { /* listener error */ } });
}

// ── Store helpers ──

function boardFor(name?: string | null): { b: Board; key: string } {
  const s = getStore();
  const key = name && s.boards[name] ? name : s.boardNames[0];
  return { b: s.boards[key], key };
}

function pushUndo(key: string) {
  const s = getStore();
  const list = s.undoStack[key] || (s.undoStack[key] = []);
  list.push(yamlDump(s.boards[key], { indent: 2, lineWidth: -1 }));
  if (list.length > 20) list.shift();
}

function logHistory(op: string, boardName: string, entry: Partial<HistoryEntry>) {
  const s = getStore();
  s.history.unshift({
    op, board: boardName, card: entry.card || "",
    old_value: entry.old_value, new_value: entry.new_value, field: entry.field,
    at: new Date().toISOString(),
  });
  if (s.history.length > 200) s.history.length = 200;
}

function newId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

function slugify(text: string, existing: string[]): string {
  let slug = text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "card";
  let id = slug;
  let i = 2;
  while (existing.includes(id)) { id = `${slug}-${i}`; i++; }
  return id;
}

export function getDemoCardHistory(cardId: string): HistoryEntry[] {
  return getStore().history.filter((e) => e.card === cardId);
}

// ── Derived views over live store state ──

function mindSnapshot(name?: string | null) {
  const s = getStore();
  const { b, key } = boardFor(name);
  const byColumn: Record<string, number> = {};
  b.columns.forEach((c) => { byColumn[c.id] = 0; });
  b.cards.forEach((c) => { byColumn[c.column] = (byColumn[c.column] || 0) + 1; });
  const now = Date.now();
  const activeSprint = s.sprints.find((sp) => sp.start && new Date(sp.start).getTime() <= now && (!sp.end || new Date(sp.end).getTime() >= now)) || null;
  const done = b.cards.filter((c) => c.column === "done");
  const points = done.reduce((acc, c) => acc + ((c as any).effort ?? 1), 0);
  const blockers = b.cards.filter(isBlocked).map((c) => ({
    card_id: c.id, title: c.title,
    blocked_by: c.blocked_by ? [c.blocked_by] : c.links.filter((l) => l.ty === "blocked-by").map((l) => l.target),
  }));
  const staleCards = b.cards
    .filter((c) => c.column !== "done" && now - Date.parse(c.updated_at) > 7 * 86400000)
    .map((c) => ({ id: c.id, title: c.title, column: c.column, days: Math.floor((now - Date.parse(c.updated_at)) / 86400000) }));
  const nextActions: { action: string; reason: string }[] = [];
  const pending = s.tasks.filter((t) => t.status === "Pending").length;
  const active = s.tasks.filter((t) => t.status === "InProgress" || t.status === "Assigned").length;
  if (pending > 0) {
    nextActions.push({ action: "barkcli dispatch", reason: `${pending} task${pending === 1 ? "" : "s"} pending in the queue${active ? ` · ${active} active` : ""}` });
  }
  blockers.forEach((bl) => nextActions.push({ action: `barkcli ${key} unblock ${bl.card_id}`, reason: `blocked by ${bl.blocked_by.join(", ")}` }));
  staleCards.slice(0, 3).forEach((st) => nextActions.push({ action: `barkcli ${key} move ${st.id} doing`, reason: `stale ${st.days}d in ${st.column}` }));
  b.cards.filter((c) => c.column === "review").slice(0, 2).forEach((c) => nextActions.push({ action: `barkcli ${key} move ${c.id} done`, reason: "in review — close it" }));
  return {
    board_name: key,
    generated_at: new Date().toISOString(),
    stats: { total: b.cards.length, by_column: byColumn },
    active_sprint: activeSprint ? { name: activeSprint.name } : null,
    velocity: done.length ? { total_done: done.length, total_points: points, avg_effort: points / done.length } : null,
    blockers,
    stale_cards: staleCards,
    next_actions: nextActions,
    recent_history: s.history.slice(0, 5),
    recent_sessions: s.sessions.slice(0, 4),
    top_memories: [...s.memory].sort((x, y) => (y.importance ?? 0) - (x.importance ?? 0)).slice(0, 3),
  };
}

function brainGraph(name?: string | null) {
  const s = getStore();
  const { b } = boardFor(name);
  const nodes: any[] = [];
  const edges: { from: string; to: string; kind: string; weight: number }[] = [];
  const push = (n: any) => nodes.push(n);
  const byId = new Set<string>();

  b.cards.forEach((c) => {
    push({ id: `card:${c.id}`, label: c.title, kind: "card", importance: c.column === "done" ? 0.3 : 0.7, access_count: 0, tags: c.labels, created_at: c.created_at });
    byId.add(`card:${c.id}`);
  });
  s.agents.forEach((a) => {
    push({ id: `agent:${a.id}`, label: a.name, kind: "agent", importance: 0.9, access_count: 0, tags: [a.role], created_at: d(30) });
    byId.add(`agent:${a.id}`);
  });
  s.memory.forEach((m) => {
    push({ id: `mem:${m.id}`, label: m.content.slice(0, 60), kind: "memory", tier: m.tier, importance: m.importance ?? 0.5, access_count: m.access_count, tags: m.tags, created_at: m.created_at });
    byId.add(`mem:${m.id}`);
  });
  s.facts.forEach((f, i) => {
    push({ id: `fact:${i}`, label: f.fact.slice(0, 60), kind: "fact", importance: f.confidence, access_count: 0, tags: [f.category], created_at: f.created_at });
    byId.add(`fact:${i}`);
  });
  // Edges: blockers between cards; agents assigned to task cards.
  b.cards.forEach((c) => {
    const targets = c.blocked_by ? [c.blocked_by] : c.links.filter((l) => l.ty === "blocked-by").map((l) => l.target);
    targets.forEach((t) => { if (byId.has(`card:${t}`)) edges.push({ from: `card:${c.id}`, to: `card:${t}`, kind: "blocked-by", weight: 2 }); });
  });
  s.tasks.forEach((t) => {
    if (!t.assigned_agent) return;
    if (byId.has(`agent:${t.assigned_agent}`) && byId.has(`card:${t.card_id}`)) {
      edges.push({ from: `agent:${t.assigned_agent}`, to: `card:${t.card_id}`, kind: "assigned", weight: 1.5 });
    }
  });
  return { nodes, edges };
}

function autopilotStatus(name?: string | null) {
  const s = getStore();
  const { b } = boardFor(name);
  const unplanned = b.cards.filter((c) => c.column === "todo" && !c.spec_id).length;
  const inReview = b.cards.filter((c) => c.column === "review").length;
  const blocked = b.cards.filter(isBlocked).length;
  const queuePending = s.tasks.filter((t) => t.status === "Pending").length;
  const queueActive = s.tasks.filter((t) => t.status === "InProgress" || t.status === "Assigned").length;
  const phase = s.pendingProposal ? "AwaitingPlanApproval" : unplanned > 0 ? "NeedsPlan" : inReview > 0 ? "AwaitingMerge" : "Running";
  const prompts: Record<string, string> = {
    NeedsPlan: "Cards need a plan — propose one to start the loop.",
    AwaitingPlanApproval: "A plan is waiting for your approval.",
    AwaitingMerge: "Cards in review await a merge decision.",
    Running: "Autopilot is running — all gates clear.",
  };
  const actions: Record<string, string> = {
    NeedsPlan: `Plan '${b.cards.find((c) => c.column === "todo" && !c.spec_id)?.id || ""}' — human approves at the gate`,
    AwaitingPlanApproval: "Waiting for plan approval",
    AwaitingMerge: "Waiting for review pass",
    Running: "Nothing needs a human right now",
  };
  return {
    phase,
    phase_label: phase.replace(/([A-Z])/g, " $1").trim(),
    needs_human: phase !== "Running",
    human_prompt: prompts[phase],
    agent_action: actions[phase],
    counts: {
      todo_unplanned: unplanned,
      pending_proposals: s.pendingProposal ? 1 : 0,
      queue_pending: queuePending,
      queue_active: queueActive,
      in_review: inReview,
      blocked,
    },
    proposal: s.pendingProposal ?? undefined,
  };
}

function specCoverage() {
  const s = getStore();
  const reqs = s.specs.flatMap((sp) => sp.requirements);
  const total = reqs.length;
  const implemented = reqs.filter((r) => r.status === "implemented" || r.status === "verified").length;
  const verified = reqs.filter((r) => r.status === "verified").length;
  const stale = reqs.filter((r) => r.stale).length;
  return { total_requirements: total, implemented, verified, stale, coverage_percent: total ? Math.round((implemented / total) * 100) : 0 };
}

// Mini code index for the Code tab search.
const CODE_INDEX: { path: string; symbols: string[]; cards: string[] }[] = [
  { path: "web/src/App.tsx", symbols: ["App", "BoardPage", "slugify", "HelpModal"], cards: ["demo-mode", "kiosk-mode"] },
  { path: "web/src/components/BoardView.tsx", symbols: ["BoardView", "KanbanColumn"], cards: ["kiosk-mode", "share-links"] },
  { path: "web/src/lib/api.ts", symbols: ["fetchBoard", "saveBoard", "connectWs"], cards: ["ws-live-reload", "demo-mode"] },
  { path: "barkcli-core/src/commands.rs", symbols: ["add_card", "move_card", "list_cards"], cards: ["card-crud"] },
  { path: "barkcli-core/src/memory.rs", symbols: ["decay", "consolidate"], cards: ["memory-tiers"] },
  { path: "barkcli-core/src/history.rs", symbols: ["scan_bundles"], cards: ["history-bundles"] },
  { path: "barkcli-server/src/lib.rs", symbols: ["router", "ws_reloader"], cards: ["ws-live-reload", "demo-mode"] },
];

// ── Route table ──

interface RouteCtx { q: URLSearchParams; body: any }
interface Route { method: string; re: RegExp; handle: (m: RegExpMatchArray, ctx: RouteCtx) => Promise<any> | any }

const json = (data: any, status = 200) =>
  new Response(JSON.stringify(data ?? {}), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

const ROUTES: Route[] = [
  // Boards: list / create / delete
  { method: "GET", re: /^\/api\/boards$/, handle: () => ({ boards: getStore().boardNames }) },
  {
    method: "POST", re: /^\/api\/boards\/create$/, handle: (_m, { body }) => {
      const s = getStore();
      const name = slugify(body.title || "board", s.boardNames);
      const cols = Array.isArray(body.columns) && body.columns.length ? body.columns : ["todo", "doing", "review", "done"];
      s.boards[name] = emptyBoard(body.title || name, cols);
      s.boardNames.push(name);
      persist();
      emitChange();
      return { name };
    },
  },
  {
    method: "DELETE", re: /^\/api\/boards\/([^/]+)$/, handle: (m) => {
      const s = getStore();
      if (m[1] && s.boards[m[1]]) {
        delete s.boards[m[1]];
        s.boardNames = s.boardNames.filter((n) => n !== m[1]);
        persist();
        emitChange();
      }
      return {};
    },
  },
  // Board read / write (the core loop of the whole app)
  {
    method: "GET", re: /^\/api\/board$/, handle: (_m, { q }) => {
      const { b } = boardFor(q.get("name"));
      return { yaml: yamlDump(b, { indent: 2, lineWidth: -1 }) };
    },
  },
  {
    method: "PUT", re: /^\/api\/board$/, handle: (_m, { body, q }) => {
      const s = getStore();
      const key = body.name || q.get("name") || null;
      const { key: k0 } = boardFor(key);
      pushUndo(k0);
      s.boards[k0] = yamlParse(body.yaml) as Board;
      persist();
      emitChange();
      return {};
    },
  },
  // Undo / diff / blame
  {
    method: "POST", re: /^\/api\/undo$/, handle: (_m, { q }) => {
      const s = getStore();
      const { key } = boardFor(q.get("name"));
      const prev = s.undoStack[key]?.pop();
      if (!prev) return { ok: false };
      const before = s.boards[key];
      s.boards[key] = yamlParse(prev) as Board;
      const lastEntry = s.history.find((e) => e.board === key) || ({} as HistoryEntry);
      logHistory("undo", key, { old_value: new Date().toISOString(), card: lastEntry.card || "" });
      persist();
      emitChange();
      return { ok: true, undid: "last board change", card_id: before?.cards[0]?.id };
    },
  },
  {
    method: "GET", re: /^\/api\/diff$/, handle: (_m, { q }) => {
      const s = getStore();
      const { key, b } = boardFor(q.get("name"));
      const prevYaml = s.undoStack[key]?.[s.undoStack[key].length - 1];
      if (!prevYaml) return { added: [], removed: [], moved: [] };
      const prev = yamlParse(prevYaml) as Board;
      const prevMap = new Map(prev.cards.map((c) => [c.id, c]));
      const curMap = new Map(b.cards.map((c) => [c.id, c]));
      const added = b.cards.filter((c) => !prevMap.has(c.id)).map((c) => ({ id: c.id, title: c.title, column: c.column }));
      const removed = prev.cards.filter((c) => !curMap.has(c.id)).map((c) => ({ id: c.id, title: c.title, column: c.column }));
      const moved = prev.cards
        .filter((c) => curMap.has(c.id) && curMap.get(c.id)!.column !== c.column)
        .map((c) => ({ id: c.id, title: c.title, from: c.column, to: curMap.get(c.id)!.column }));
      return { added, removed, moved };
    },
  },
  {
    method: "GET", re: /^\/api\/blame\/([^/]+)$/, handle: (m, { q }) => {
      const { key } = boardFor(q.get("name"));
      return getStore().history.filter((e) => e.card === m[1] && e.board === key).map((e) => ({ at: e.at, op: e.op }));
    },
  },
  // Checkpoints + snapshots (Timeline)
  {
    method: "GET", re: /^\/api\/checkpoints$/, handle: (_m, { q }) => {
      const name = q.get("name");
      const list = getStore().checkpoints.filter((c) => !name || c.board_name === name);
      return { checkpoints: list.map(({ kind, id, saved_at }) => ({ kind, id, saved_at })) };
    },
  },
  {
    method: "POST", re: /^\/api\/checkpoints$/,
    handle: (_m, { body, q }) => saveCheckpoint("checkpoint", body?.label, q.get("name")),
  },
  {
    method: "POST", re: /^\/api\/checkpoints\/([^/]+)\/restore$/, handle: (m) => {
      const s = getStore();
      const cp = s.checkpoints.find((c) => c.id === m[1]);
      if (cp?.yaml) {
        s.boards[cp.board_name] = yamlParse(cp.yaml) as Board;
        persist();
        emitChange();
      }
      return {};
    },
  },
  {
    method: "POST", re: /^\/api\/snapshot$/, handle: (_m, { body, q }) => saveCheckpoint("snapshot", body?.label || "snapshot", q.get("name")),
  },
  // Sprints
  {
    method: "GET", re: /^\/api\/sprints$/, handle: () => ({ sprints: getStore().sprints }),
  },
  {
    method: "POST", re: /^\/api\/sprints$/, handle: (_m, { body }) => {
      const s = getStore();
      s.sprints.push({ name: body.name || "sprint", start: new Date().toISOString().slice(0, 10), end: body.end || inDays(14).slice(0, 10), created_at: new Date().toISOString() });
      persist();
      emitChange();
      return {};
    },
  },
  {
    method: "POST", re: /^\/api\/sprints\/end$/, handle: (_m, { body }) => {
      const s = getStore();
      const now = new Date().toISOString().slice(0, 10);
      const target = (body?.name ? s.sprints.filter((sp) => sp.name === body.name) : s.sprints).filter((sp) => !sp.end || new Date(sp.end).getTime() >= Date.now());
      target.sort((a, b) => (a.start && b.start ? (a.start < b.start ? 1 : -1) : 0));
      if (target[0]) {
        target[0].end = now;
        persist();
        emitChange();
      }
      return {};
    },
  },
  // History + sessions
  {
    method: "GET", re: /^\/api\/history$/, handle: (_m, { q }) => {
      let entries = getStore().history;
      if (q.get("card")) entries = entries.filter((e) => e.card === q.get("card"));
      if (q.get("board")) entries = entries.filter((e) => e.board === q.get("board"));
      entries = entries.filter((e) => !q.get("op") || e.op === q.get("op"));
      const limit = Number(q.get("limit") || 0);
      return { entries: limit ? entries.slice(0, limit) : entries };
    },
  },
  {
    method: "GET", re: /^\/api\/sessions$/, handle: () => ({ sessions: getStore().sessions }),
  },
  // Context (card file refs)
  {
    method: "GET", re: /^\/api\/context$/, handle: () => ({
      cards: {
        "history-bundles": {
          files: [
            { path: "barkcli-core/src/history.rs", symbols: ["scan_bundles", "Bundle"], source: "ai", status: "modified" },
            { path: "barkcli-core/tests/bundles.rs", symbols: ["test_scan"], source: "tests", status: "tracked" },
          ],
          sessions: ["ses-2", "ses-3"],
          ai: {
            summary: "Bundle scanner lives in barkcli-core; server exposes scan/approve endpoints. Open items: squash merges + card linkage.",
            at: new Date().toISOString(),
            model: "demo-local",
            confidence: 0.86,
            next_steps: ["Treat squash pairs as one bundle", "Link bundle → card on approve"],
          },
          last_sync_commit: "9f4bd21",
          last_sync_at: h(6),
        } as unknown as CardContext,
      },
    }),
  },
  { method: "POST", re: /^\/api\/context\/(sync|clear)$/, handle: () => ({ ok: true }) },
  // Code search
  {
    method: "GET", re: /^\/api\/code$/, handle: (_m, { q }) => {
      const query = (q.get("q") || "").toLowerCase();
      if (!query) return { results: [] };
      return {
        results: CODE_INDEX.filter((r) =>
          r.path.toLowerCase().includes(query) || r.symbols.some((s) => s.toLowerCase().includes(query))
        ).map((r) => ({ ...r, symbols: r.symbols.filter((s) => s.toLowerCase().includes(query) || r.path.toLowerCase().includes(query)) })),
      };
    },
  },
  // Agents + orchestration
  {
    method: "GET", re: /^\/api\/agents$/, handle: () => ({ agents: getStore().agents }),
  },
  {
    method: "POST", re: /^\/api\/agents$/, handle: (_m, { body }) => {
      const s = getStore();
      s.agents.push({
        id: body.id || newId("agent"), name: body.name || body.id || "agent", role: body.role || "ScrumMaster",
        status: "Idle", active_tasks: [], completed_tasks: [], failed_tasks: [],
      });
      persist();
      return {};
    },
  },
  {
    method: "DELETE", re: /^\/api\/agents\/([^/]+)$/, handle: (m) => {
      const s = getStore();
      s.agents = s.agents.filter((a) => a.id !== m[1]);
      s.tasks.forEach((t) => { if (t.assigned_agent === m[1]) t.assigned_agent = undefined; });
      persist();
      return {};
    },
  },
  {
    method: "GET", re: /^\/api\/tasks$/, handle: (_m, { q }) => {
      let tasks = getStore().tasks;
      // A replayed run moves its own tasks InProgress → Completed in step with
      // the live rows, so the queue and the session strip tell one story.
      if (isReplayMode()) {
        tasks = tasks.map((t) => {
          const st = replayTaskStatus(t.id);
          return st && st !== t.status ? { ...t, status: st } : t;
        });
      }
      const status = q.get("status");
      if (status) tasks = tasks.filter((t) => t.status === status);
      return { tasks };
    },
  },
  {
    method: "POST", re: /^\/api\/tasks$/, handle: (_m, { body }) => {
      const s = getStore();
      const task: TaskRec = {
        id: newId("task"), card_id: body.card_id || "", title: body.title || "task",
        description: body.description || "", status: "Pending", assigned_agent: body.assigned_agent,
        priority: body.priority || "medium", created_at: new Date().toISOString(),
      };
      s.tasks.push(task);
      if (task.assigned_agent) {
        const ag = s.agents.find((a) => a.id === task.assigned_agent);
        if (ag) ag.active_tasks.push(task.id);
      }
      persist();
      emitChange();
      return { task };
    },
  },
  {
    method: "PUT", re: /^\/api\/tasks\/([^/]+)$/, handle: (m, { body }) => {
      const s = getStore();
      const t = s.tasks.find((x) => x.id === m[1]);
      if (t) Object.assign(t, body);
      persist();
      return { task: t };
    },
  },
  {
    method: "DELETE", re: /^\/api\/tasks\/([^/]+)$/, handle: (m) => {
      const s = getStore();
      s.tasks = s.tasks.filter((t) => t.id !== m[1]);
      persist();
      return {};
    },
  },
  {
    method: "POST", re: /^\/api\/tasks\/([^/]+)\/claim$/, handle: (m, { body }) => {
      const s = getStore();
      const t = s.tasks.find((x) => x.id === m[1]);
      if (t) {
        t.assigned_agent = body?.agent || t.assigned_agent;
        t.status = "Assigned";
        const ag = s.agents.find((a) => a.id === t.assigned_agent);
        if (ag && !ag.active_tasks.includes(t.id)) ag.active_tasks.push(t.id);
        persist();
      }
      return {};
    },
  },
  {
    method: "POST", re: /^\/api\/tasks\/([^/]+)\/complete$/, handle: (m) => {
      const s = getStore();
      const t = s.tasks.find((x) => x.id === m[1]);
      if (t) {
        t.status = "Completed";
        const ag = s.agents.find((a) => a.id === t.assigned_agent);
        if (ag) {
          ag.active_tasks = ag.active_tasks.filter((x) => x !== t.id);
          ag.completed_tasks.push(t.id);
        }
        s.orch.tasks_completed += 1;
        persist();
        emitChange();
      }
      return {};
    },
  },
  {
    method: "POST", re: /^\/api\/tasks\/([^/]+)\/fail$/, handle: (m) => {
      const s = getStore();
      const t = s.tasks.find((x) => x.id === m[1]);
      if (t) {
        t.status = "Failed";
        t.assigned_agent = undefined;
        s.orch.tasks_failed += 1;
        persist();
        emitChange();
      }
      return {};
    },
  },
  {
    // Recorded 3-agent run (only when ?run=replay). Normal demo returns none.
    method: "GET", re: /^\/api\/run\/live$/, handle: () => ({ sessions: replaySessions() }),
  },
  {
    method: "GET", re: /^\/api\/orchestrate\/status$/, handle: () => {
      const s = getStore();
      return { status: "idle", ...s.orch, agents: s.agents.length };
    },
  },
  {
    method: "POST", re: /^\/api\/orchestrate\/cycle$/, handle: () => {
      const s = getStore();
      let created = 0;
      let dispatched = 0;
      const insights: string[] = [];
      // 1) turn unplanned todo cards into queued tasks
      const { b, key } = boardFor(null);
      const open = b.cards.filter((c) => c.column !== "done");
      for (const c of open) {
        if (s.tasks.some((t) => t.card_id === c.id && t.status !== "Completed")) continue;
        s.tasks.push({ id: newId("task"), card_id: c.id, title: c.title, description: c.description || "", status: "Pending", priority: c.priority, created_at: new Date().toISOString() });
        created++;
      }
      // 2) dispatch assigned pending tasks, advance in-progress ones
      for (const t of s.tasks) {
        if (t.status === "Assigned" && t.assigned_agent) {
          t.status = "InProgress";
          dispatched++;
        } else if (t.assigned_agent && t.status === "InProgress") {
          t.status = "Completed";
          s.orch.tasks_completed += 1;
        }
      }
      // 3) move completed task cards to review (board-visible effect)
      for (const t of s.tasks) {
        if (t.status === "Completed") {
          const card = b.cards.find((c) => c.id === t.card_id);
          if (card && card.column === "doing") {
            card.column = "review";
            card.updated_at = new Date().toISOString();
            logHistory("move", key, { card: card.id, old_value: "doing", new_value: "review" });
          }
        }
      }
      s.orch.cycle_count += 1;
      s.orch.tasks_dispatched += dispatched;
      insights.push(`${created} unplanned card(s) queued`, `${dispatched} task(s) dispatched to agents`);
      if (b.cards.some((c) => c.column === "review")) insights.push("1+ card(s) awaiting review — run review when ready");
      persist();
      emitChange();
      return { tasks_created: created, tasks_dispatched: dispatched, insights };
    },
  },
  // Memory
  {
    method: "GET", re: /^\/api\/memory$/, handle: (_m, { q }) => {
      let mems = getStore().memory;
      const tier = q.get("tier");
      const query = (q.get("q") || "").toLowerCase();
      if (tier) mems = mems.filter((m) => m.tier === tier);
      if (query) mems = mems.filter((m) => m.content.toLowerCase().includes(query) || m.tags.join(" ").includes(query));
      mems = [...mems].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
      const limit = Number(q.get("limit") || 0);
      return { memories: limit ? mems.slice(0, limit) : mems, total: mems.length };
    },
  },
  {
    method: "POST", re: /^\/api\/memory$/, handle: (_m, { body }) => {
      const s = getStore();
      const entry: MemoryEntry = {
        id: newId("mem"), content: body.content, tier: body.tier || "working",
        tags: body.tags || [], source: body.source || "WEB",
        created_at: new Date().toISOString(), last_accessed: new Date().toISOString(),
        access_count: 1, importance: 0.5,
      };
      s.memory.unshift(entry);
      persist();
      emitChange();
      return entry;
    },
  },
  {
    method: "DELETE", re: /^\/api\/memory\/([^/]+)$/, handle: (m) => {
      const s = getStore();
      s.memory = s.memory.filter((x) => x.id !== m[1]);
      persist();
      return {};
    },
  },
  {
    method: "GET", re: /^\/api\/memory\/stats$/, handle: () => {
      const s = getStore();
      const byTier: Record<string, number> = {};
      s.memory.forEach((m) => { byTier[m.tier] = (byTier[m.tier] || 0) + 1; });
      return { total: s.memory.length, by_tier: byTier, facts: s.facts.length };
    },
  },
  {
    method: "POST", re: /^\/api\/memory\/fact$/, handle: (_m, { body }) => {
      const s = getStore();
      const fact: ProjectFact = {
        fact: body.fact, category: body.category || "general",
        confidence: body.confidence ?? 0.6, sources: body.sources || ["web"],
        created_at: new Date().toISOString(),
      };
      s.facts.unshift(fact);
      persist();
      emitChange();
      return fact;
    },
  },
  {
    method: "GET", re: /^\/api\/memory\/facts$/, handle: (_m, { q }) => {
      let facts = getStore().facts;
      if (q.get("category")) facts = facts.filter((f) => f.category === q.get("category"));
      return { facts };
    },
  },
  {
    method: "POST", re: /^\/api\/memory\/ingest$/, handle: () => {
      const s = getStore();
      const entry: MemoryEntry = {
        id: newId("mem"), content: `Session ${new Date().toISOString().slice(0, 16)} — demo ingest distilled 1 memory from sessions.`,
        tier: "short_term", tags: ["ingest"], source: "SESSION",
        created_at: new Date().toISOString(), last_accessed: new Date().toISOString(),
        access_count: 1, importance: 0.4,
      };
      s.memory.unshift(entry);
      persist();
      emitChange();
      return { sessions_ingested: 3, memories_added: 1, consolidated: false };
    },
  },
  {
    method: "POST", re: /^\/api\/memory\/consolidate$/, handle: () => {
      const s = getStore();
      let promoted = 0;
      s.memory.forEach((m) => {
        if (m.tier === "working" && (m.importance ?? 0) > 0.55) { m.tier = "short_term"; promoted++; }
        else if (m.tier === "short_term" && (m.importance ?? 0) > 0.65) { m.tier = "long_term"; promoted++; }
      });
      persist();
      emitChange();
      return { promoted, compressed: true, evicted: 0 };
    },
  },
  // Brain
  { method: "GET", re: /^\/api\/brain$/, handle: (_m, { q }) => brainGraph(q.get("name")) },
  {
    method: "GET", re: /^\/api\/brain\/node\/([^/]+)$/, handle: (m, { q }) => {
      const { nodes, edges } = brainGraph(q.get("name"));
      const node = nodes.find((n) => n.id === m[1]);
      if (!node) return { node: null, neighbors: [] };
      const neighbors = edges
        .filter((e) => e.from === m[1] || e.to === m[1])
        .map((e) => nodes.find((n) => n.id === (e.from === m[1] ? e.to : e.from)))
        .filter(Boolean);
      return { node, neighbors };
    },
  },
  // Specs
  { method: "GET", re: /^\/api\/specs$/, handle: () => ({ specs: getStore().specs }) },
  { method: "GET", re: /^\/api\/specs\/coverage$/, handle: () => specCoverage() },
  {
    method: "GET", re: /^\/api\/specs\/([^/]+)$/, handle: (m) => getStore().specs.find((s) => s.id === m[1]) ?? null,
  },
  {
    method: "POST", re: /^\/api\/specs$/, handle: (_m, { body }) => {
      const s = getStore();
      const spec: SpecRec = {
        id: slugify(body.title || "spec", s.specs.map((x) => x.id)), title: body.title || "spec",
        description: body.description || "", status: "draft", priority: body.priority || "medium",
        requirements: [], tags: body.tags || [], created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      };
      s.specs.unshift(spec);
      persist();
      emitChange();
      return spec;
    },
  },
  {
    method: "PUT", re: /^\/api\/specs\/([^/]+)$/, handle: (m, { body }) => {
      const s = getStore();
      const spec = s.specs.find((x) => x.id === m[1]);
      if (spec) { Object.assign(spec, body); spec.updated_at = new Date().toISOString(); persist(); }
      return spec;
    },
  },
  {
    method: "DELETE", re: /^\/api\/specs\/([^/]+)$/, handle: (m) => {
      const s = getStore();
      s.specs = s.specs.filter((x) => x.id !== m[1]);
      persist();
      return {};
    },
  },
  {
    method: "POST", re: /^\/api\/specs\/([^/]+)\/requirements$/, handle: (m, { body }) => {
      const s = getStore();
      const spec = s.specs.find((x) => x.id === m[1]);
      if (spec) {
        spec.requirements.push({
          id: `req-${spec.requirements.length + 1}`, title: body.title || "requirement",
          description: body.description || "", status: "pending",
          acceptance_criteria: body.acceptance_criteria || [], linked_code: [], linked_tests: [],
          linked_tasks: [], stale: false, updated_at: new Date().toISOString(),
        });
        spec.updated_at = new Date().toISOString();
        persist();
        emitChange();
      }
      return spec;
    },
  },
  {
    method: "PUT", re: /^\/api\/specs\/([^/]+)\/requirements\/([^/]+)$/, handle: (m, { body }) => {
      const s = getStore();
      const spec = s.specs.find((x) => x.id === m[1]);
      const req = spec?.requirements.find((r) => r.id === m[2]);
      if (req) { Object.assign(req, body); req.updated_at = new Date().toISOString(); spec!.updated_at = req.updated_at; persist(); emitChange(); }
      return spec;
    },
  },
  // Autopilot + intent
  { method: "GET", re: /^\/api\/autopilot\/status$/, handle: (_m, { q }) => autopilotStatus(q.get("name")) },
  {
    method: "POST", re: /^\/api\/intake$/, handle: (_m, { body, q }) => {
      const { b, key } = boardFor(q.get("board") || body.board || null);
      const text = (body.text || "").trim();
      const id = slugify(text, b.cards.map((c) => c.id));
      const now = new Date().toISOString();
      b.cards = [...b.cards, card({
        id, title: text, column: "todo",
        description: "Intake intent submitted from web Mind view.",
        priority: "medium", labels: [body.kind || "intent"], created_at: now, updated_at: now,
      })];
      logHistory("add", key, { card: id, new_value: "todo" });
      persist();
      emitChange();
      return { card_id: id };
    },
  },
  {
    method: "POST", re: /^\/api\/autopilot\/propose$/, handle: (_m, { body, q }) => {
      const { b } = boardFor(q.get("board") || body.board || null);
      const card = b.cards.find((c) => c.id === body.card_id);
      if (!card) return null;
      const criteria = card.acceptance_criteria.length ? card.acceptance_criteria : card.checklist.map((c) => c.text);
      const slices = [
        { title: `${card.title} — slice 1 (core loop)`, effort: Math.max(1, Math.round(((card as any).effort ?? 2) * 0.6)) },
        { title: `${card.title} — slice 2 (polish + edge cases)`, effort: Math.max(1, Math.round(((card as any).effort ?? 2) * 0.4)) },
      ];
      const proposal: PlanProposal = {
        card_id: card.id,
        card_title: card.title,
        proposed_at: new Date().toISOString(),
        proposed_by: "scrum-master-1",
        requirements: slices.map((sl, i) => ({ title: sl.title, acceptance_criteria: criteria.length ? [criteria[i % criteria.length]] : ["Meets the card's intent"], effort: sl.effort })),
        children: slices.map((sl, i) => ({
          title: sl.title, description: `Proposed slice for ${card.title}.\n\nFrom spec: ${card.description || "—"}`,
          priority: card.priority, effort: sl.effort, labels: [...card.labels],
          acceptance_criteria: criteria.length ? [criteria[i % criteria.length]] : [],
        })),
        estimated_total_effort: slices.reduce((a, s) => a + s.effort, 0),
        risk_level: card.priority === "high" ? "medium" : "low",
        rationale: "Two slices keep the core loop shippable; polish follows after the first merge.",
      };
      const s = getStore();
      s.pendingProposal = proposal;
      persist();
      return proposal;
    },
  },
  {
    method: "POST", re: /^\/api\/autopilot\/approve$/, handle: (_m, { body, q }) => {
      const s = getStore();
      const proposal = s.pendingProposal;
      if (!proposal) return { ok: false };
      const { key, b } = boardFor(q.get("board") || body.board || null);
      const now = new Date().toISOString();
      const existing = b.cards.map((c) => c.id);
      proposal.children.forEach((sl) => {
        const id = slugify(sl.title, existing); existing.push(id);
        b.cards = [...b.cards, card({
          id, title: sl.title, column: "todo", priority: sl.priority,
          description: sl.description, labels: sl.labels, acceptance_criteria: sl.acceptance_criteria,
          effort: sl.effort, spec_id: b.cards.find((c) => c.id === proposal.card_id)?.spec_id,
          created_at: now, updated_at: now,
        })];
        logHistory("add", key, { card: id, new_value: "todo" });
        s.tasks.push({ id: newId("task"), card_id: id, title: `Build: ${sl.title}`, description: sl.description, status: "Pending", priority: sl.priority, created_at: now });
      });
      // Star the parent as being planned
      const parent = b.cards.find((c) => c.id === proposal.card_id);
      if (parent) parent.pinned = true;
      s.pendingProposal = null;
      persist();
      emitChange();
      return { ok: true };
    },
  },
  {
    method: "POST", re: /^\/api\/autopilot\/reject$/, handle: () => {
      const s = getStore();
      s.pendingProposal = null;
      persist();
      return { ok: true };
    },
  },
  {
    method: "POST", re: /^\/api\/review$/, handle: (_m, { q }) => {
      const { b, key } = boardFor(q.get("board") || null);
      let n = 0;
      const now = new Date().toISOString();
      b.cards = b.cards.map((c) => {
        if (c.column !== "review") return c;
        n++;
        return { ...c, column: "done", updated_at: now };
      });
      if (n) { logHistory("move", key, { old_value: "review", new_value: `done ×${n}` }); persist(); emitChange(); }
      return { reviewed: n };
    },
  },
  // Bundles
  { method: "GET", re: /^\/api\/bundles$/, handle: () => ({ bundles: getStore().bundles }) },
  { method: "POST", re: /^\/api\/bundles\/scan$/, handle: () => { persist(); return {}; } },
  { method: "GET", re: /^\/api\/bundles\/tree$/, handle: () => {
      const s = getStore();
      const tree = s.bundles.map((b) => `├── ${b.branch}  ${b.status}  (${b.commit_count} commits, conf ${Math.round(b.confidence * 100)}%)\n    └── ${b.title}`).join("\n");
      return { tree: `dev (main)\n${tree}` };
    } },
  {
    method: "POST", re: /^\/api\/bundles\/([^/]+)\/(approve|reject|seal)$/, handle: (m) => {
      const s = getStore();
      const b = s.bundles.find((x) => x.id === m[1]);
      if (b) b.status = m[2] === "approve" ? "approved" : m[2] === "reject" ? "rejected" : "sealed";
      persist();
      return {};
    },
  },
  // Docs
  { method: "GET", re: /^\/api\/docs$/, handle: () => ({ docs: DOCS }) },
  {
    method: "GET", re: /^\/api\/docs\/([^/]+)$/, handle: async (m) => {
      return { content: await readDoc(m[1]) };
    },
  },
  // Mind
  { method: "GET", re: /^\/api\/mind\/digest$/, handle: (_m, { q }) => {
      const snap = mindSnapshot(q.get("name"));
      const digest = [
        `# barkcli mind — ${snap.board_name}`,
        `Generated: ${snap.generated_at}`,
        "",
        `Cards: ${snap.stats.total} (${Object.entries(snap.stats.by_column).map(([k, v]) => `${k}:${v}`).join(" ")})`,
        `Sprint: ${snap.active_sprint?.name || "none"}`,
        "",
        "## Next actions",
        ...snap.next_actions.map((a) => `- ${a.action}  (${a.reason})`),
        "",
        "## Blockers",
        ...snap.blockers.map((b) => `- ${b.card_id}: blocked by ${b.blocked_by.join(", ")}`),
        "",
        "## Stale >7d",
        ...snap.stale_cards.map((s) => `- ${s.id} (${s.column}, ${s.days}d)`),
      ].join("\n");
      return { digest };
    } },
  { method: "GET", re: /^\/api\/mind$/, handle: (_m, { q }) => mindSnapshot(q.get("name")) },
  // Skills
  { method: "GET", re: /^\/api\/skills$/, handle: () => ({ skills: getStore().skills }) },
  { method: "GET", re: /^\/api\/skills\/([^/]+)$/, handle: (m) => getStore().skills.find((s) => s.id === m[1]) ?? null },
  // Config (SettingsVR view shows AI config)
  {
    method: "GET", re: /^\/api\/config$/, handle: () => ({
      ai: { base_url: "http://localhost:11434/v1", model: "demo-local" },
    }),
  },
  // Validate + doctor
  {
    method: "GET", re: /^\/api\/validate$/, handle: () => {
      const s = getStore();
      const boards = s.boardNames.map((name) => {
        const b = s.boards[name];
        const errors: string[] = [];
        if (!b.title) errors.push("missing title");
        if (!b.columns.length) errors.push("no columns");
        b.cards.forEach((c) => { if (!b.columns.some((col) => col.id === c.column)) errors.push(`card ${c.id} in unknown column ${c.column}`); });
        return { name, valid: errors.length === 0, errors };
      });
      return { boards, all_valid: boards.every((b) => b.valid) };
    },
  },
  {
    method: "POST", re: /^\/api\/doctor$/, handle: () => {
      const s = getStore();
      return {
        boards: s.boardNames.map((name) => ({ name, errors_before: 0, errors_after: 0, fixed: [] })),
        fixed: 0,
      };
    },
  },
  // Export / import
  {
    method: "GET", re: /^\/api\/export$/, handle: (_m, { q }) => {
      const { b, key } = boardFor(q.get("name"));
      const fmt = q.get("format") || "yaml";
      const body = fmt === "json" ? JSON.stringify(b, null, 2) : yamlDump(b, { indent: 2, lineWidth: -1 });
      return new Response(body, {
        status: 200,
        headers: { "content-type": fmt === "json" ? "application/json" : "text/yaml", "cache-control": "no-store" },
      });
    },
  },
  {
    method: "POST", re: /^\/api\/import$/, handle: (_m, { body, q }) => {
      const s = getStore();
      const key = q.get("name") || s.boardNames[0];
      let parsed: Board | null = null;
      try {
        parsed = body.yaml ? (yamlParse(body.yaml) as Board) : (typeof body.json === "string" ? JSON.parse(body.json) : body.json);
      } catch { return { ok: false }; }
      if (parsed && parsed.cards && parsed.columns) {
        pushUndo(key);
        s.boards[key] = parsed;
        persist();
        emitChange();
      }
      return { ok: true };
    },
  },
];

function saveCheckpoint(kind: string, label: string | undefined, name: string | null) {
  const s = getStore();
  const { b, key } = boardFor(name);
  s.checkpoints.unshift({
    kind, id: kind === "snapshot" ? newId("snap") : newId("cp"),
    saved_at: new Date().toISOString(), label: label || `${kind}-${s.checkpoints.length + 1}`,
    board_name: key, yaml: yamlDump(b, { indent: 2, lineWidth: -1 }),
  });
  persist();
  return {};
}

// ── Fetch shim ──

export function installDemoApi(): void {
  const realFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" || input instanceof URL ? input.toString() : input.url;
    const idx = url.indexOf("/api/");
    if (idx === -1) return realFetch(input as RequestInfo, init);

    let path = new URL(url, window.location.origin).pathname;
    const i = path.indexOf("/api/");
    if (i > 0) path = path.slice(i);

    const method = (init?.method || "GET").toUpperCase();
    let body: any = {};
    if (init?.body) {
      try { body = JSON.parse(init.body as string); } catch { body = {}; }
    }
    const query = new URL(url, window.location.origin).searchParams;

    for (const route of ROUTES) {
      if (route.method !== method) continue;
      const m = path.match(route.re);
      if (m) {
        const data = await route.handle(m, { q: query, body });
        return data instanceof Response ? data : json(data);
      }
    }
    // Unknown endpoints: respond benign so views degrade to empty states.
    return json({ error: `demo: no handler for ${method} ${path}` }, 200);
  };
}
