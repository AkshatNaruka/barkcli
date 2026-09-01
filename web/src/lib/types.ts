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
