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
