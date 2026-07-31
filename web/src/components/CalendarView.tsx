import React from "react";
import type { Board as BoardType, Card } from "../lib/types";

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

  // Build calendar grid
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div className="p-4 h-full overflow-auto">
      <h2 className="text-xl font-bold text-gray-200 mb-4">{monthNames[month]} {year}</h2>
      <div className="grid grid-cols-7 gap-1">
        {dayHeaders.map((d) => (
          <div key={d} className="text-center text-xs font-medium text-gray-500 py-2 border-b border-gray-800">
            {d}
          </div>
        ))}
        {cells.map((day, i) => {
          const dateStr = day ? `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}` : null;
          const cards = dateStr ? cardsByDate[dateStr] || [] : [];
          return (
            <div key={i} className={`min-h-[80px] border border-gray-800 rounded p-1 ${day ? "bg-gray-900" : "bg-transparent"}`}>
              {day && (
                <>
                  <div className="text-xs text-gray-500 mb-1">{day}</div>
                  {cards.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => onEditCard(c)}
                      className="block w-full text-left text-xs bg-blue-900/40 text-blue-300 rounded px-1.5 py-0.5 mb-0.5 truncate hover:bg-blue-800/40"
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
