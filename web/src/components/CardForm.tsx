import React, { useState } from "react";
import type { Card, Column, ChecklistItem } from "../lib/types";

interface Props {
  card?: Card;
  columns: Column[];
  defaultColumn?: string;
  authors?: string[];
  onSave: (data: Partial<Card>) => void;
  onCancel: () => void;
  onDelete?: () => void;
}

export function CardForm({ card, columns, defaultColumn, authors = [], onSave, onCancel, onDelete }: Props) {
  const [title, setTitle] = useState(card?.title || "");
  const [desc, setDesc] = useState(card?.description || "");
  const [column, setColumn] = useState(card?.column || defaultColumn || columns[0]?.id || "");
  const [priority, setPriority] = useState(card?.priority || "medium");
  const [labels, setLabels] = useState((card?.labels || []).join(", "));
  const [assignee, setAssignee] = useState(card?.assignee || "");
  const [dueDate, setDueDate] = useState(card?.due_date?.slice(0, 10) || "");
  const [checklist, setChecklist] = useState<ChecklistItem[]>(card?.checklist || []);
  const [newItem, setNewItem] = useState("");
  const [showAuthors, setShowAuthors] = useState(false);
  const [commentText, setCommentText] = useState("");

  const filteredAuthors = authors.filter((a) =>
    assignee ? a.toLowerCase().includes(assignee.toLowerCase()) : true
  ).slice(0, 5);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onSave({
      title: title.trim(),
      description: desc.trim(),
      column,
      priority,
      labels: labels.split(",").map((s) => s.trim()).filter(Boolean),
      assignee: assignee.trim() || undefined,
      due_date: dueDate ? `${dueDate}T00:00:00Z` : undefined,
      checklist,
    });
  };

  const addChecklistItem = () => {
    if (!newItem.trim()) return;
    setChecklist([...checklist, { text: newItem.trim(), done: false }]);
    setNewItem("");
  };

  const toggleChecklistItem = (idx: number) => {
    setChecklist(checklist.map((item, i) => i === idx ? { ...item, done: !item.done } : item));
  };

  const removeChecklistItem = (idx: number) => {
    setChecklist(checklist.filter((_, i) => i !== idx));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onCancel}>
      <div className="bg-gray-900 rounded-xl shadow-2xl w-full max-w-lg mx-4 p-6 border border-gray-800 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold mb-4 text-gray-100">{card ? "Edit Card" : "New Card"}</h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Title *</label>
            <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-500"
              placeholder="Card title" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Description</label>
            <textarea value={desc} onChange={(e) => setDesc(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-500 resize-none" rows={2}
              placeholder="Optional description" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Column</label>
              <select value={column} onChange={(e) => setColumn(e.target.value)}
                className="w-full px-2 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                {columns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Priority</label>
              <select value={priority} onChange={(e) => setPriority(e.target.value)}
                className="w-full px-2 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Labels (comma-separated)</label>
            <input value={labels} onChange={(e) => setLabels(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-500"
              placeholder="bug, frontend, urgent" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="relative">
              <label className="block text-xs font-medium text-gray-400 mb-1">Assignee</label>
              <input value={assignee} onChange={(e) => { setAssignee(e.target.value); setShowAuthors(true); }}
                onFocus={() => setShowAuthors(true)} onBlur={() => setTimeout(() => setShowAuthors(false), 200)}
                className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-500"
                placeholder="Username" />
              {showAuthors && filteredAuthors.length > 0 && (
                <div className="absolute top-full left-0 right-0 z-30 bg-gray-800 border border-gray-700 rounded-lg mt-1 overflow-hidden shadow-xl">
                  {filteredAuthors.map((a) => (
                    <button key={a} type="button" onMouseDown={() => { setAssignee(a); setShowAuthors(false); }}
                      className="w-full text-left px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-700">{a}</button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Due date</label>
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          {/* Checklist */}
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Checklist</label>
            <div className="space-y-1.5 mb-2 max-h-32 overflow-y-auto">
              {checklist.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <button type="button" onClick={() => toggleChecklistItem(idx)}
                    className={`text-xs ${item.done ? "text-emerald-400" : "text-gray-500"} hover:text-gray-300`}>
                    {item.done ? "☑" : "☐"}
                  </button>
                  <span className={`flex-1 text-xs ${item.done ? "text-gray-500 line-through" : "text-gray-300"}`}>{item.text}</span>
                  <button type="button" onClick={() => removeChecklistItem(idx)} className="text-gray-600 hover:text-red-400 text-xs">✕</button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input value={newItem} onChange={(e) => setNewItem(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addChecklistItem(); } }}
                className="flex-1 px-2 py-1.5 rounded bg-gray-800 border border-gray-700 text-gray-100 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="Add checklist item" />
              <button type="button" onClick={addChecklistItem} className="px-3 py-1.5 text-xs rounded bg-gray-700 text-gray-300 hover:bg-gray-600">Add</button>
            </div>
          </div>

          {/* Comments display (read-only in form) */}
          {card && card.comments.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Comments ({card.comments.length})</label>
              <div className="space-y-2 max-h-24 overflow-y-auto">
                {card.comments.map((c, i) => (
                  <div key={i} className="text-xs">
                    <span className="text-gray-400 font-medium">{c.author}</span>
                    <span className="text-gray-600 ml-2">{c.at?.slice(0, 10)}</span>
                    <p className="text-gray-300 mt-0.5">{c.text}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-between mt-2">
            {onDelete && (
              <button type="button" onClick={onDelete} className="px-3 py-2 text-sm text-red-400 hover:bg-red-900/20 rounded-lg">Delete</button>
            )}
            <div className="flex gap-2 ml-auto">
              <button type="button" onClick={onCancel} className="px-4 py-2 text-sm rounded-lg border border-gray-700 text-gray-300 hover:bg-gray-800">Cancel</button>
              <button type="submit" className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 font-medium">{card ? "Save" : "Add"}</button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
