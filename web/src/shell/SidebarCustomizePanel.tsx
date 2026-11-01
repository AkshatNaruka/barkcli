import React, { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../components/Icon";
import { AccessibleDialog } from "../components/AccessibleDialog";
import { QuietSelect } from "../components/QuietSelect";
import {
  DEFAULT_GROUP_IDS,
  SIDEBAR_TOOL_MAP,
  addGroup,
  moveGroup,
  moveItem,
  moveItemToGroup,
  removeGroup,
  renameGroup,
  resetSidebarLayout,
  setItemHidden,
  updateSidebarLayout,
  useSidebarLayout,
  type SidebarGroup,
  type SidebarLayout,
} from "../lib/sidebarLayout";

type DragState =
  | { kind: "group"; groupId: string }
  | { kind: "item"; groupId: string; itemId: string };

function reorderGroup(layout: SidebarLayout, fromId: string, toId: string): SidebarLayout {
  const from = layout.groups.findIndex((group) => group.id === fromId);
  const to = layout.groups.findIndex((group) => group.id === toId);
  if (from < 0 || to < 0 || from === to) return layout;
  return moveGroup(layout, fromId, to - from);
}

function GroupCard({
  group,
  index,
  total,
  groups,
  hidden,
  initiallyRenaming,
  drag,
  onDrag,
  onDropGroup,
  onDropItem,
}: {
  group: SidebarGroup;
  index: number;
  total: number;
  groups: SidebarGroup[];
  hidden: string[];
  initiallyRenaming: boolean;
  drag: DragState | null;
  onDrag: (state: DragState | null) => void;
  onDropGroup: (fromId: string, toId: string) => void;
  onDropItem: (itemId: string, groupId: string, at: number) => void;
}) {
  const isDefault = (DEFAULT_GROUP_IDS as readonly string[]).includes(group.id);
  const [label, setLabel] = useState(group.label);
  const [renaming, setRenaming] = useState(initiallyRenaming);
  const nameButton = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);

  useEffect(() => {
    if (!renaming && returnFocus.current) {
      nameButton.current?.focus();
      returnFocus.current = false;
    }
  }, [renaming]);

  useEffect(() => {
    if (!renaming) setLabel(group.label);
  }, [group.label, renaming]);

  const commitLabel = () => {
    setRenaming(false);
    updateSidebarLayout((layout) => renameGroup(layout, group.id, label));
  };

  return (
    <section
      className={`sidebar-group-card ${drag?.kind === "group" && drag.groupId === group.id ? "is-dragging" : ""}`}
      onDragOver={(event) => {
        if (drag?.kind === "group" && drag.groupId !== group.id) event.preventDefault();
        if (drag?.kind === "item") event.preventDefault();
      }}
      onDrop={(event) => {
        event.preventDefault();
        if (drag?.kind === "group" && drag.groupId !== group.id) onDropGroup(drag.groupId, group.id);
        if (drag?.kind === "item") onDropItem(drag.itemId, group.id, group.items.length);
        onDrag(null);
      }}
    >
      <header
        className="sidebar-group-head"
        onDragOver={(event) => {
          if (drag?.kind === "item") event.preventDefault();
        }}
        onDrop={(event) => {
          if (drag?.kind !== "item") return;
          event.preventDefault();
          event.stopPropagation();
          onDropItem(drag.itemId, group.id, group.items.length);
          onDrag(null);
        }}
      >
        <span
          className="sidebar-drag"
          draggable
          title="Drag to reorder group"
          onDragStart={(event) => {
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("text/plain", group.id);
            onDrag({ kind: "group", groupId: group.id });
          }}
          onDragEnd={() => onDrag(null)}
        >
          <Icon name="grip" size={13} />
        </span>
        {renaming ? (
          <input
            className="sidebar-group-name is-editing"
            value={label}
            aria-label={`Rename ${group.label}`}
            autoFocus
            maxLength={40}
            onFocus={(event) => event.currentTarget.select()}
            onChange={(event) => setLabel(event.target.value)}
            onBlur={commitLabel}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return;
              if (event.key === "Enter") {
                event.preventDefault();
                returnFocus.current = true;
                commitLabel();
              }
              if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                returnFocus.current = true;
                setLabel(group.label);
                setRenaming(false);
              }
            }}
          />
        ) : (
          <button
            ref={nameButton}
            type="button"
            className="sidebar-group-name"
            title="Rename group"
            onClick={() => setRenaming(true)}
          >
            {group.label}
          </button>
        )}
        <span className="sidebar-group-count">{group.items.length}</span>
        <div className="sidebar-group-actions">
          <button
            type="button"
            className="sidebar-mini"
            title="Move group up"
            aria-label={`Move ${group.label} up`}
            disabled={index === 0}
            onClick={() => updateSidebarLayout((layout) => moveGroup(layout, group.id, -1))}
          >
            <Icon name="arrowUp" size={11} />
          </button>
          <button
            type="button"
            className="sidebar-mini"
            title="Move group down"
            aria-label={`Move ${group.label} down`}
            disabled={index >= total - 1}
            onClick={() => updateSidebarLayout((layout) => moveGroup(layout, group.id, 1))}
          >
            <Icon name="arrowDown" size={11} />
          </button>
          {!isDefault && (
            <button
              type="button"
              className="sidebar-mini"
              title="Remove group"
              aria-label={`Remove ${group.label}`}
              onClick={() => updateSidebarLayout((layout) => removeGroup(layout, group.id))}
            >
              <Icon name="trash" size={12} />
            </button>
          )}
        </div>
      </header>

      <div className="sidebar-group-items">
        {group.items.length === 0 && (
          <p className="sidebar-group-empty">No tools yet. Drag one here or use its move menu.</p>
        )}
        {group.items.map((itemId, itemIndex) => {
          const tool = SIDEBAR_TOOL_MAP.get(itemId);
          if (!tool) return null;
          const isHidden = hidden.includes(itemId);
          const isDragging = drag?.kind === "item" && drag.itemId === itemId;
          return (
            <div
              key={itemId}
              className={`sidebar-item-row ${isHidden ? "is-hidden" : ""} ${isDragging ? "is-dragging" : ""}`}
              onDragOver={(event) => {
                if (drag?.kind === "item" && drag.itemId !== itemId) event.preventDefault();
              }}
              onDrop={(event) => {
                if (drag?.kind !== "item") return;
                event.preventDefault();
                event.stopPropagation();
                if (drag.itemId !== itemId) onDropItem(drag.itemId, group.id, itemIndex);
                onDrag(null);
              }}
            >
              <span
                className="sidebar-drag"
                draggable
                title="Drag to reorder tool"
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", itemId);
                  onDrag({ kind: "item", groupId: group.id, itemId });
                }}
                onDragEnd={() => onDrag(null)}
              >
                <Icon name="grip" size={13} />
              </span>
              <span className="sidebar-item-icon"><Icon name={tool.icon} size={14} /></span>
              <span className="sidebar-item-label" title={isHidden ? `${tool.label} (hidden)` : tool.label}>
                {tool.label}
              </span>
              <div className="sidebar-item-actions">
                <button
                  type="button"
                  className="sidebar-mini"
                  title="Move up"
                  aria-label={`Move ${tool.label} up`}
                  disabled={itemIndex === 0}
                  onClick={() => updateSidebarLayout((layout) => moveItem(layout, group.id, itemId, -1))}
                >
                  <Icon name="arrowUp" size={11} />
                </button>
                <button
                  type="button"
                  className="sidebar-mini"
                  title="Move down"
                  aria-label={`Move ${tool.label} down`}
                  disabled={itemIndex >= group.items.length - 1}
                  onClick={() => updateSidebarLayout((layout) => moveItem(layout, group.id, itemId, 1))}
                >
                  <Icon name="arrowDown" size={11} />
                </button>
                <QuietSelect
                  className="sidebar-item-move"
                  value={group.id}
                  aria-label={`Move ${tool.label} to group`}
                  title="Move to group"
                  onChange={(event) => {
                    const target = event.target.value;
                    if (target !== group.id) updateSidebarLayout((layout) => moveItemToGroup(layout, itemId, target));
                  }}
                >
                  {groups.map((entry) => (
                    <option key={entry.id} value={entry.id}>{entry.label}</option>
                  ))}
                </QuietSelect>
                <button
                  type="button"
                  className="sidebar-mini"
                  title={isHidden ? "Show in sidebar" : "Hide from sidebar"}
                  aria-label={isHidden ? `Show ${tool.label}` : `Hide ${tool.label}`}
                  aria-pressed={!isHidden}
                  onClick={() => updateSidebarLayout((layout) => setItemHidden(layout, itemId, !isHidden))}
                >
                  <Icon name={isHidden ? "eyeOff" : "eye"} size={13} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function SidebarCustomizePanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const layout = useSidebarLayout();
  const [drag, setDrag] = useState<DragState | null>(null);
  const [resetArmed, setResetArmed] = useState(false);
  const [newGroupId, setNewGroupId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setResetArmed(false);
      setDrag(null);
      setNewGroupId(null);
    }
  }, [open]);

  useEffect(() => {
    if (!resetArmed) return;
    const timer = window.setTimeout(() => setResetArmed(false), 3200);
    return () => window.clearTimeout(timer);
  }, [resetArmed]);

  const visibleCount = useMemo(
    () => layout.groups.reduce(
      (count, group) => count + group.items.filter((id) => !layout.hidden.includes(id)).length,
      0
    ),
    [layout]
  );

  if (!open) return null;

  return (
    <AccessibleDialog label="Customize sidebar" onClose={onClose} className="sidebar-customize-dialog">
      <div className="sidebar-customize">
        <header className="sidebar-customize-head">
          <Icon name="sliders" size={16} className="text-accent-text" />
          <div>
            <h2>Sidebar</h2>
            <p>Arrange groups and the tools inside them.</p>
          </div>
          <button type="button" className="sidebar-mini" onClick={onClose} aria-label="Close" title="Close">
            <Icon name="x" size={14} />
          </button>
        </header>

        <div className="sidebar-customize-body">
          <p className="sidebar-customize-hint">
            {visibleCount} of {SIDEBAR_TOOL_MAP.size} tools shown. Drag the grip, or use the arrow buttons.
            Hidden tools stay searchable with ⌘K.
          </p>

          {layout.groups.map((group, index) => (
            <GroupCard
              key={group.id}
              group={group}
              index={index}
              total={layout.groups.length}
              groups={layout.groups}
              hidden={layout.hidden}
              initiallyRenaming={group.id === newGroupId}
              drag={drag}
              onDrag={setDrag}
              onDropGroup={(fromId, toId) => updateSidebarLayout((current) => reorderGroup(current, fromId, toId))}
              onDropItem={(itemId, groupId, at) =>
                updateSidebarLayout((current) => moveItemToGroup(current, itemId, groupId, at))
              }
            />
          ))}

          <button
            type="button"
            className="sidebar-customize-add"
            onClick={() => {
              const next = addGroup(layout);
              setNewGroupId(next.groups[next.groups.length - 1].id);
              updateSidebarLayout(() => next);
            }}
          >
            <Icon name="plus" size={13} />
            Add group
          </button>
        </div>

        <footer className="sidebar-customize-foot">
          <span>Saved automatically</span>
          <button
            type="button"
            className={resetArmed ? "is-armed" : ""}
            onClick={() => {
              if (!resetArmed) {
                setResetArmed(true);
                return;
              }
              resetSidebarLayout();
              setResetArmed(false);
            }}
          >
            {resetArmed ? "Confirm reset" : "Reset to default"}
          </button>
          <button type="button" className="bark-button" onClick={onClose}>Done</button>
        </footer>
      </div>
    </AccessibleDialog>
  );
}
