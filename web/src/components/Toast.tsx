import React, { useEffect } from "react";

interface Props {
  message: string;
  onClose: () => void;
}

export function Toast({ message, onClose }: Props) {
  useEffect(() => {
    const t = setTimeout(onClose, 3000);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
      <div className="bg-card text-text text-sm px-4 py-2 rounded-lg shadow-[var(--shadow)] border border-border flex items-center gap-2">
        <span>{message}</span>
        <button onClick={onClose} className="text-muted hover:text-text ml-2">×</button>
      </div>
    </div>
  );
}
