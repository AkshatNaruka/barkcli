import React from "react";
import type { Card as CardType } from "../lib/types";

interface CardProps {
  card: CardType;
}

const priorityColors: Record<string, string> = {
  high: "#ef4444",
  medium: "#f59e0b",
  low: "#6b7280",
};

export function Card({ card }: CardProps) {
  return (
    <div
      className="bg-white dark:bg-gray-800 rounded-lg p-3 shadow-sm border border-gray-200 dark:border-gray-700 cursor-pointer hover:shadow-md transition-shadow"
      style={{ borderLeftColor: priorityColors[card.priority] || "#6b7280", borderLeftWidth: "3px" }}
    >
      <div className="font-medium text-sm mb-1 text-gray-900 dark:text-gray-100">
        {card.title}
      </div>
      {card.labels.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1">
          {card.labels.map((label) => (
            <span
              key={label}
              className="text-xs px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300"
            >
              {label}
            </span>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between mt-2 text-xs text-gray-500 dark:text-gray-400">
        <span className={`font-medium ${
          card.priority === "high" ? "text-red-500" :
          card.priority === "medium" ? "text-amber-500" :
          "text-gray-400"
        }`}>
          {card.priority}
        </span>
        {card.assignee && <span>{card.assignee}</span>}
      </div>
    </div>
  );
}
