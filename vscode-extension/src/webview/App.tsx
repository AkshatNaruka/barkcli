import React, { useState, useEffect, useCallback, useRef } from "react";
import { load as yamlParse, dump as yamlDump } from "js-yaml";
import { Board } from "./components/Board";
import { CardForm } from "./components/CardForm";
import { getVsCodeApi } from "./lib/vscode";
import { generateId, nowISO } from "./lib/types";
import type { Board as BoardType, Card, Column } from "./lib/types";

export function App() {
  const [board, setBoard] = useState<BoardType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingCard, setEditingCard] = useState<Card | null>(null);
  const [addingToColumn, setAddingToColumn] = useState<string | null>(null);
  const boardRef = useRef(board);
  boardRef.current = board;

  const saveBoard = useCallback((b: BoardType) => {
    try {
      const yaml = yamlDump(b, { indent: 2, lineWidth: -1, noRefs: true });
      getVsCodeApi().postMessage({ type: "save", yaml });
    } catch (e) {
      setError(`Failed to serialize: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, []);

  const handleMessage = useCallback((event: MessageEvent) => {
    const message = event.data;
    switch (message.type) {
      case "load": {
        setError(null);
        try {
          const parsed = yamlParse(message.yaml) as BoardType;
          setBoard(parsed);
        } catch (e) {
          setError(`Failed to parse board: ${e instanceof Error ? e.message : String(e)}`);
        }
        break;
      }
      case "error": {
        setError(message.text);
        break;
      }
    }
  }, []);

  useEffect(() => {
    window.addEventListener("message", handleMessage);
    getVsCodeApi().postMessage({ type: "ready" });
    return () => window.removeEventListener("message", handleMessage);
  }, [handleMessage]);

  const handleAddCard = useCallback((columnId: string) => {
    setAddingToColumn(columnId);
  }, []);

  const handleEdit = useCallback((card: Card) => {
    setEditingCard(card);
  }, []);

  const handleDelete = useCallback((id: string) => {
    if (!boardRef.current) return;
    const b = boardRef.current;
    const next: BoardType = {
      ...b,
      cards: b.cards.filter((c) => c.id !== id),
    };
    setBoard(next);
    saveBoard(next);
  }, [saveBoard]);

  const handleMoveLeft = useCallback((id: string) => {
    if (!boardRef.current) return;
    const b = boardRef.current;
    const card = b.cards.find((c) => c.id === id);
    if (!card) return;
    const colIdx = b.columns.findIndex((c) => c.id === card.column);
    if (colIdx <= 0) return;
    const newCol = b.columns[colIdx - 1].id;
    const next: BoardType = {
      ...b,
      cards: b.cards.map((c) =>
        c.id === id ? { ...c, column: newCol, updated_at: nowISO() } : c
      ),
    };
    setBoard(next);
    saveBoard(next);
  }, [saveBoard]);

  const handleMoveRight = useCallback((id: string) => {
    if (!boardRef.current) return;
    const b = boardRef.current;
    const card = b.cards.find((c) => c.id === id);
    if (!card) return;
    const colIdx = b.columns.findIndex((c) => c.id === card.column);
    if (colIdx < 0 || colIdx >= b.columns.length - 1) return;
    const newCol = b.columns[colIdx + 1].id;
    const next: BoardType = {
      ...b,
      cards: b.cards.map((c) =>
        c.id === id ? { ...c, column: newCol, updated_at: nowISO() } : c
      ),
    };
    setBoard(next);
    saveBoard(next);
  }, [saveBoard]);

  const handleSaveNew = useCallback((data: Partial<Card>) => {
    if (!boardRef.current || !addingToColumn) return;
    const b = boardRef.current;
    const existingIds = b.cards.map((c) => c.id);
    const id = generateId(data.title!, existingIds);
    const now = nowISO();
    const newCard: Card = {
      id,
      title: data.title!,
      description: data.description || "",
      column: addingToColumn,
      priority: data.priority || "medium",
      labels: data.labels || [],
      assignee: data.assignee,
      checklist: [],
      comments: [],
      attachments: [],
      created_at: now,
      updated_at: now,
    };
    const next: BoardType = {
      ...b,
      cards: [...b.cards, newCard],
    };
    setBoard(next);
    saveBoard(next);
    setAddingToColumn(null);
  }, [addingToColumn, saveBoard]);

  const handleSaveEdit = useCallback((data: Partial<Card>) => {
    if (!boardRef.current || !editingCard) return;
    const b = boardRef.current;
    const next: BoardType = {
      ...b,
      cards: b.cards.map((c) =>
        c.id === editingCard.id
          ? { ...c, ...data, updated_at: nowISO() }
          : c
      ),
    };
    setBoard(next);
    saveBoard(next);
    setEditingCard(null);
  }, [editingCard, saveBoard]);

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-red-500 bg-red-50 dark:bg-red-900/20 p-4 rounded-lg max-w-lg">
          <h2 className="font-bold mb-2">Error</h2>
          <p className="text-sm">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <Board
        board={board}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onMoveLeft={handleMoveLeft}
        onMoveRight={handleMoveRight}
        onAddCard={handleAddCard}
      />
      {addingToColumn && board && (
        <CardForm
          columns={board.columns}
          onSave={handleSaveNew}
          onCancel={() => setAddingToColumn(null)}
        />
      )}
      {editingCard && board && (
        <CardForm
          card={editingCard}
          columns={board.columns}
          onSave={handleSaveEdit}
          onCancel={() => setEditingCard(null)}
        />
      )}
    </>
  );
}
