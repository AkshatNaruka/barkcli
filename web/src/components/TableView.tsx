import React from "react";
import type { Board as BoardType, Card } from "../lib/types";
import { Avatar } from "./Avatar";
import { PriorityBadge } from "./PriorityBadge";
import { labelClasses } from "../lib/labels";

interface Props {
  board: BoardType;
  onEditCard: (card: Card) => void;
  onDeleteCard: (id: string) => void;
  onMoveCard: (id: string, column: string) => void;
}

export function TableView({ board, onEditCard, onDeleteCard, onMoveCard }: Props) {
  return (
    <div className="p-4 overflow-auto h-full">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-muted text-xs">
            <th className="p-2 font-medium">ID</th>
            <th className="p-2 font-medium">Title</th>
            <th className="p-2 font-medium">Column</th>
            <th className="p-2 font-medium">Priority</th>
            <th className="p-2 font-medium">Labels</th>
            <th className="p-2 font-medium">Assignee</th>
            <th className="p-2 font-medium w-16"></th>
          </tr>
        </thead>
        <tbody>
          {board.cards.map((card) => (
            <tr key={card.id} className="border-b border-border/50 hover:bg-surface transition-colors">
              <td className="p-2 text-muted font-mono text-xs">{card.id}</td>
              <td className="p-2 text-text">
                <button onClick={() => onEditCard(card)} className="hover:text-accent text-left transition-colors">
                  {card.title}
                </button>
              </td>
              <td className="p-2">
                <select
                  value={card.column}
                  onChange={(e) => onMoveCard(card.id, e.target.value)}
                  className="bg-surface text-text text-xs rounded px-2 py-1 border border-border hover:border-border-strong focus:outline-none focus:ring-1 focus:ring-accent"
                >
                  {board.columns.map((col) => (
                    <option key={col.id} value={col.id}>{col.name}</option>
                  ))}
                </select>
              </td>
              <td className="p-2"><PriorityBadge priority={card.priority} /></td>
              <td className="p-2">
                <div className="flex flex-wrap gap-1">
                  {card.labels.slice(0, 3).map((l) => (
                    <span key={l} className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${labelClasses(l)}`}>{l}</span>
                  ))}
                </div>
              </td>
              <td className="p-2">
                {card.assignee ? (
                  <span className="flex items-center gap-1.5 text-muted">
                    <Avatar name={card.assignee} /> {card.assignee}
                  </span>
                ) : (
                  <span className="text-muted">-</span>
                )}
              </td>
              <td className="p-2">
                <button onClick={() => onDeleteCard(card.id)} className="text-muted hover:text-danger text-xs transition-colors">Del</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
