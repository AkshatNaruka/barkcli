import React, { useState, useEffect, useCallback } from "react";
import { load as yamlParse } from "js-yaml";
import { Board } from "./components/Board";
import { getVsCodeApi } from "./lib/vscode";
import type { Board as BoardType } from "./lib/types";

export function App() {
  const [board, setBoard] = useState<BoardType | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  return <Board board={board} />;
}
