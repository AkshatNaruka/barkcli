export interface Column {
  id: string;
  name: string;
}

export type LinkType = "parent" | "child" | "related" | "blocked-by";

export interface CardLink {
  ty: LinkType;
  target: string;
}

export interface Card {
  id: string;
  title: string;
  description?: string;
  column: string;
  priority: string;
  labels: string[];
  assignee?: string;
  checklist: ChecklistItem[];
  due_date?: string;
  remind_at?: string;
  comments: Comment[];
  blocked_by?: string;
  attachments: string[];
  links: CardLink[];
  acceptance_criteria: string[];
  effort?: number;
  area?: string;
  spec_id?: string;
  pinned: boolean;
  created_at: string;
  updated_at: string;
}

export interface FileRef {
  path: string;
  symbols: string[];
  source: string;
  last_commit?: string;
  status: string;
}

export interface AiSummary {
  summary: string;
  at: string;
  model?: string;
  confidence: number;
  next_steps: string[];
}

export interface CardContext {
  files: FileRef[];
  sessions: string[];
  ai?: AiSummary;
  last_sync_commit?: string;
  last_sync_at?: string;
}

export interface HistoryEntry {
  op: string;
  board: string;
  card: string;
  old_value?: string;
  new_value?: string;
  field?: string;
  at: string;
}

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

export interface SessionEntry {
  id: string;
  agent: string;
  model?: string;
  board: string;
  prompt?: string;
  commit_sha?: string;
  files_touched?: string[];
  summary?: string;
  at: string;
  duration_ms?: number;
}

export interface Sprint {
  name: string;
  start?: string;
  end?: string;
  created_at?: string;
}

export interface ChecklistItem {
  text: string;
  done: boolean;
}

export interface Comment {
  author: string;
  text: string;
  at: string;
}

export interface Board {
  title: string;
  description?: string;
  columns: Column[];
  cards: Card[];
}

export type ViewMode = "board" | "table" | "calendar" | "list";

// ── New types for Phase 1+ features ──

export type MemoryTier = "working" | "short_term" | "long_term" | "external";

export interface MemoryEntry {
  id: string;
  content: string;
  tier: MemoryTier;
  tags: string[];
  source?: string;
  created_at: string;
  last_accessed: string;
  access_count: number;
  importance?: number;
}

export interface ProjectFact {
  fact: string;
  category: string;
  confidence: number;
  sources: string[];
  created_at: string;
}

export type SpecStatus = "draft" | "in-progress" | "implemented" | "verified" | "deprecated";
export type RequirementStatus = "pending" | "in-progress" | "implemented" | "verified" | "failed";

export interface Requirement {
  id: string;
  title: string;
  description?: string;
  status: RequirementStatus;
  acceptance_criteria: string[];
  linked_code: string[];
  linked_tests: string[];
  linked_tasks: string[];
  stale: boolean;
  stale_reason?: string;
  updated_at: string;
}

export interface Spec {
  id: string;
  title: string;
  description?: string;
  status: SpecStatus;
  priority: string;
  requirements: Requirement[];
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface SpecCoverage {
  total_requirements: number;
  implemented: number;
  verified: number;
  stale: number;
  coverage_percent: number;
}

export interface CheckpointEntry {
  kind: string;
  id: string;
  saved_at: string;
}

export interface ValidateBoardResult {
  name: string;
  valid: boolean;
  errors: string[];
}

export interface DoctorBoardResult {
  name: string;
  errors_before: number;
  errors_after: number;
  fixed: string[];
}

export interface DiffCard {
  id: string;
  title: string;
  column: string;
}

export interface DiffMoved {
  id: string;
  title: string;
  from: string;
  to: string;
}

export interface BlameEntry {
  at: string;
  op: string;
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

export interface ThreadEvent {
  id: string;
  card_id: string;
  kind: string;
  author: string;
  text: string;
  data?: any;
  created_at: string;
}

export interface ThreadSummary {
  id: string;
  title: string;
  status_group: "needs_you" | "stalled" | "running" | "features" | "settled" | string;
  event_count: number;
  last_event?: ThreadEvent;
  updated_at: string;
  column: string;
  backend?: string;
  /** Newest agent heartbeat / lease / note for this card. */
  last_seen?: string;
}

export interface ThreadDetail {
  id: string;
  card?: Card;
  events: ThreadEvent[];
}

export interface SessionTranscript {
  id: string;
  status: string;
  lines: string[];
  total_lines: number;
  transcript_path?: string;
}

export interface TaskDiff {
  task_id: string;
  branch: string;
  diff: string;
  files: string[];
}
