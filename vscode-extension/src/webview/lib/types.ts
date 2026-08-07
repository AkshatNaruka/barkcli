export interface Column {
  id: string;
  name: string;
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
  attachments: string[];
  created_at: string;
  updated_at: string;
}

export interface Board {
  title: string;
  description?: string;
  columns: Column[];
  cards: Card[];
}

export function generateId(title: string, existingIds: string[]): string {
  let slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  if (!slug) slug = "card";
  let id = slug;
  let i = 1;
  while (existingIds.includes(id)) {
    id = `${slug}-${i}`;
    i++;
  }
  return id;
}

export function nowISO(): string {
  return new Date().toISOString();
}
