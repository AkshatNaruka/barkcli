import { describe, it, expect, beforeEach } from "vitest";
import {
  loadFolderState,
  createFolder,
  renameFolder,
  deleteFolder,
  toggleFolderCollapsed,
  moveThreadsToFolder,
} from "./threadFolders";

describe("threadFolders", () => {
  const scope = "test-scope";

  beforeEach(() => {
    localStorage.clear();
  });

  it("loads empty state by default", () => {
    const state = loadFolderState(scope);
    expect(state.folders).toEqual([]);
    expect(state.threadFolderMap).toEqual({});
  });

  it("creates and renames folders", () => {
    const folder = createFolder(scope, "Feature Auth");
    expect(folder.name).toBe("Feature Auth");
    expect(folder.collapsed).toBe(false);

    let state = loadFolderState(scope);
    expect(state.folders).toHaveLength(1);
    expect(state.folders[0].name).toBe("Feature Auth");

    renameFolder(scope, folder.id, "Security & Auth");
    state = loadFolderState(scope);
    expect(state.folders[0].name).toBe("Security & Auth");
  });

  it("toggles collapse state", () => {
    const folder = createFolder(scope, "Sprint 1");
    expect(folder.collapsed).toBe(false);

    toggleFolderCollapsed(scope, folder.id);
    let state = loadFolderState(scope);
    expect(state.folders[0].collapsed).toBe(true);

    toggleFolderCollapsed(scope, folder.id);
    state = loadFolderState(scope);
    expect(state.folders[0].collapsed).toBe(false);
  });

  it("moves threads to folders and removes them when folder is deleted", () => {
    const folder = createFolder(scope, "Refactoring");
    moveThreadsToFolder(scope, ["t1", "t2"], folder.id);

    let state = loadFolderState(scope);
    expect(state.threadFolderMap["t1"]).toBe(folder.id);
    expect(state.threadFolderMap["t2"]).toBe(folder.id);

    // Unassign t1
    moveThreadsToFolder(scope, ["t1"], null);
    state = loadFolderState(scope);
    expect(state.threadFolderMap["t1"]).toBeUndefined();
    expect(state.threadFolderMap["t2"]).toBe(folder.id);

    // Delete folder cleans up mapping
    deleteFolder(scope, folder.id);
    state = loadFolderState(scope);
    expect(state.folders).toHaveLength(0);
    expect(state.threadFolderMap["t2"]).toBeUndefined();
  });
});
