export interface Column {
  id: string;
  name: string;
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
  comments: Comment[];
  created_at: string;
  updated_at: string;
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
