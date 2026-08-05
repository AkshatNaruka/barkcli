import React from "react";
import type { Board as BoardType, Card } from "../lib/types";
import { labelClasses } from "../lib/labels";

interface Props {
  board: BoardType;
  onEditCard: (card: Card) => void;
}

export function CalendarView({ board, onEditCard }: Props) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  const cardsByDate: Record<string, Card[]> = {};
  for (const card of board.cards) {
    if (card.due_date) {
      const d = card.due_date.slice(0, 10);
      if (!cardsByDate[d]) cardsByDate[d] = [];
      cardsByDate[d].push(card);
    }
  }

  const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const dayHeaders = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div className="p-4 h-full overflow-auto">
      <h2 className="text-lg font-bold text-text mb-4">{monthNames[month]} {year}</h2>
      <div className="grid grid-cols-7 gap-1">
        {dayHeaders.map((d) => (
          <div key={d} className="text-center text-xs font-medium text-muted py-2 border-b border-border">
            {d}
          </div>
        ))}
        {cells.map((day, i) => {
          const dateStr = day ? `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}` : null;
          const cards = dateStr ? cardsByDate[dateStr] || [] : [];
          const isToday = dateStr === todayStr;
          return (
            <div key={i} className={`min-h-[80px] border rounded p-1 ${day ? (isToday ? "bg-accent-soft border-accent" : "bg-surface border-border") : "bg-transparent border-transparent"}`}>
              {day && (
                <>
                  <div className={`text-xs mb-1 ${isToday ? "text-accent font-bold" : "text-muted"}`}>{day}</div>
                  {cards.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => onEditCard(c)}
                      className={`block w-full text-left text-[10px] font-medium rounded px-1.5 py-0.5 mb-0.5 truncate transition-colors ${labelClasses(c.labels[0] || "card")}`}
                      title={c.title}
                    >
                      {c.title}
                    </button>
                  ))}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
