import React from "react";
import type { Board as BoardType, Card } from "../lib/types";

interface Props {
  board: BoardType;
  onEditCard: (card: Card) => void;
  onDeleteCard: (id: string) => void;
  onMoveCard: (id: string, column: string) => void;
}

export function TableView({ board, onEditCard, onDeleteCard, onMoveCard }: Props) {
  const priorityOrder = { high: 0, medium: 1, low: 2 };

  return (
    <div className="p-4 overflow-auto h-full">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-800 text-left text-gray-400 text-xs">
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
            <tr key={card.id} className="border-b border-gray-800/50 hover:bg-gray-800/50">
              <td className="p-2 text-gray-500 font-mono text-xs">{card.id}</td>
              <td className="p-2 text-gray-200">
                <button onClick={() => onEditCard(card)} className="hover:text-blue-400 text-left">
                  {card.title}
                </button>
              </td>
              <td className="p-2">
                <select
                  value={card.column}
                  onChange={(e) => onMoveCard(card.id, e.target.value)}
                  className="bg-gray-800 text-gray-300 text-xs rounded px-2 py-1 border border-gray-700"
                >
                  {board.columns.map((col) => (
                    <option key={col.id} value={col.id}>{col.name}</option>
                  ))}
                </select>
              </td>
              <td className="p-2">
                <span className={`text-xs font-medium ${
                  card.priority === "high" ? "text-red-400" : card.priority === "medium" ? "text-amber-400" : "text-gray-500"
                }`}>{card.priority}</span>
              </td>
              <td className="p-2">
                <div className="flex flex-wrap gap-1">
                  {card.labels.map((l) => (
                    <span key={l} className="text-xs px-1.5 py-0.5 rounded bg-blue-900/50 text-blue-300">{l}</span>
                  ))}
                </div>
              </td>
              <td className="p-2 text-gray-400">{card.assignee || "-"}</td>
              <td className="p-2">
                <button onClick={() => onDeleteCard(card.id)} className="text-gray-500 hover:text-red-400 text-xs">Del</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
