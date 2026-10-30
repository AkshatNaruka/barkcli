import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { deleteThread, forkThread, updateThread } from "../lib/api";
import { AccessibleDialog } from "../components/AccessibleDialog";
import { Icon } from "../components/Icon";

export interface ThreadActionTarget {
  id: string;
  title: string;
  pinned?: boolean;
  settled?: boolean;
}

interface ThreadActionsMenuProps {
  target: ThreadActionTarget;
  boardName?: string | null;
  position: { x: number; y: number };
  onClose: () => void;
  onChanged: () => void;
  onForked: (threadId: string) => void;
  onDeleted: () => void;
}

const MENU_WIDTH = 228;
const MENU_HEIGHT = 320;

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      const copied = document.execCommand("copy");
      area.remove();
      return copied;
    } catch {
      return false;
    }
  }
}

export function ThreadActionsMenu({
  target,
  boardName,
  position,
  onClose,
  onChanged,
  onForked,
  onDeleted,
}: ThreadActionsMenuProps) {
  const [dialog, setDialog] = useState<"rename" | "delete" | null>(null);
  const [title, setTitle] = useState(target.title);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (dialog) return;
    const container = menu.current;
    container?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const down = (event: PointerEvent) => {
      if (!container?.contains(event.target as Node)) onClose();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener("pointerdown", down, true);
    document.addEventListener("keydown", key, true);
    window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("pointerdown", down, true);
      document.removeEventListener("keydown", key, true);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose, dialog]);

  const run = async (action: () => Promise<{ ok: boolean; error?: string }>, done: () => void) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await action();
    setBusy(false);
    if (!result.ok) {
      setError(result.error || "That action did not complete.");
      return;
    }
    done();
  };

  const pin = () =>
    void run(
      () => updateThread(target.id, { board: boardName || undefined, pinned: !target.pinned }),
      () => {
        onChanged();
        onClose();
      }
    );

  const settle = () =>
    void run(
      () => updateThread(target.id, { board: boardName || undefined, settled: !target.settled }),
      () => {
        onChanged();
        onClose();
      }
    );

  const fork = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await forkThread(target.id, { board: boardName || undefined });
    setBusy(false);
    if (!result.ok || !result.threadId) {
      setError(result.error || "Could not fork this thread.");
      return;
    }
    onChanged();
    onForked(result.threadId);
    onClose();
  };

  const copy = async () => {
    setError(null);
    const board = boardName ? `&board=${encodeURIComponent(boardName)}` : "";
    const link = `${window.location.origin}${window.location.pathname}#/chat?thread=${encodeURIComponent(target.id)}${board}`;
    if (await copyText(link)) {
      setCopied(true);
      window.setTimeout(onClose, 650);
    } else {
      setError("Could not copy the link.");
    }
  };

  const rename = () =>
    void run(
      () => updateThread(target.id, { board: boardName || undefined, title: title.trim() }),
      () => {
        onChanged();
        setDialog(null);
        onClose();
      }
    );

  const remove = () =>
    void run(
      () => deleteThread(target.id, boardName || undefined),
      () => {
        onDeleted();
        setDialog(null);
        onClose();
      }
    );

  const left = Math.max(8, Math.min(position.x, window.innerWidth - MENU_WIDTH - 8));
  const top = Math.max(8, Math.min(position.y, window.innerHeight - MENU_HEIGHT - 8));

  return (
    <>
      {dialog === null && createPortal(
        <div
          ref={menu}
          className="thread-menu"
          role="menu"
          aria-label={`Actions for ${target.title}`}
          style={{ left, top }}
          onKeyDown={(event) => {
            const items = Array.from(
              event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')
            );
            const index = items.indexOf(document.activeElement as HTMLButtonElement);
            if (event.key === "ArrowDown") {
              event.preventDefault();
              items[(index + 1) % items.length]?.focus();
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              items[(index - 1 + items.length) % items.length]?.focus();
            } else if (event.key === "Home") {
              event.preventDefault();
              items[0]?.focus();
            } else if (event.key === "End") {
              event.preventDefault();
              items[items.length - 1]?.focus();
            }
          }}
        >
          <button type="button" role="menuitem" disabled={busy} onClick={pin}>
            <Icon name="pin" size={14} />
            {target.pinned ? "Unpin thread" : "Pin thread"}
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={busy}
            onClick={() => {
              setError(null);
              setDialog("rename");
            }}
          >
            <Icon name="pencil" size={14} />
            Rename thread…
          </button>
          <button type="button" role="menuitem" disabled={busy} onClick={() => void fork()}>
            <Icon name="branch" size={14} />
            Fork thread
          </button>
          <button type="button" role="menuitem" disabled={busy} onClick={settle}>
            <Icon name={target.settled ? "refresh" : "check"} size={14} />
            {target.settled ? "Reopen thread" : "Settle thread"}
          </button>
          <div className="thread-menu-sep" role="separator" />
          <button type="button" role="menuitem" disabled={busy} onClick={() => void copy()}>
            <Icon name={copied ? "check" : "link"} size={14} />
            {copied ? "Link copied" : "Copy link"}
          </button>
          <div className="thread-menu-sep" role="separator" />
          <button
            type="button"
            role="menuitem"
            className="is-danger"
            disabled={busy}
            onClick={() => {
              setError(null);
              setDialog("delete");
            }}
          >
            <Icon name="trash" size={14} />
            Delete thread…
          </button>
          {error && !dialog && <p className="thread-menu-error" role="alert">{error}</p>}
        </div>,
        document.body
      )}

      {dialog === "rename" && (
        <AccessibleDialog label="Rename thread" onClose={() => setDialog(null)} className="thread-dialog-shell">
          <form
            className="thread-dialog"
            onSubmit={(event) => {
              event.preventDefault();
              if (title.trim() && !busy) rename();
            }}
          >
            <h2>Rename thread</h2>
            <input
              autoFocus
              className="bark-field"
              aria-label="Thread title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
            {error && <p role="alert" className="text-danger">{error}</p>}
            <div className="thread-dialog-actions">
              <button type="button" className="bark-button" onClick={() => setDialog(null)}>
                Cancel
              </button>
              <button className="bark-primary" type="submit" disabled={!title.trim() || busy}>
                {busy ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        </AccessibleDialog>
      )}

      {dialog === "delete" && (
        <AccessibleDialog label="Delete thread" onClose={() => setDialog(null)} className="thread-dialog-shell">
          <div className="thread-dialog">
            <h2>Delete “{target.title}”?</h2>
            <p>
              This removes the board card and its conversation. Run records and worktrees stay on
              disk.
            </p>
            {error && <p role="alert" className="text-danger">{error}</p>}
            <div className="thread-dialog-actions">
              <button type="button" className="bark-button" onClick={() => setDialog(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="bark-danger"
                disabled={busy}
                onClick={remove}
              >
                <Icon name="trash" size={13} />
                {busy ? "Deleting…" : "Delete thread"}
              </button>
            </div>
          </div>
        </AccessibleDialog>
      )}
    </>
  );
}
