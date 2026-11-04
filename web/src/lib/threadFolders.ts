export interface ThreadFolder {
  id: string;
  name: string;
  collapsed?: boolean;
  createdAt: string;
}

export interface ThreadFolderState {
  folders: ThreadFolder[];
  threadFolderMap: Record<string, string>; // threadId -> folderId
}

const STORAGE_KEY_PREFIX = "bark:thread-folders:";

function getStorageKey(scope?: string): string {
  return `${STORAGE_KEY_PREFIX}${scope || "default"}`;
}

export function loadFolderState(scope?: string): ThreadFolderState {
  try {
    const raw = localStorage.getItem(getStorageKey(scope));
    if (!raw) return { folders: [], threadFolderMap: {} };
    const parsed = JSON.parse(raw);
    return {
      folders: Array.isArray(parsed?.folders) ? parsed.folders : [],
      threadFolderMap:
        parsed?.threadFolderMap && typeof parsed.threadFolderMap === "object"
          ? parsed.threadFolderMap
          : {},
    };
  } catch {
    return { folders: [], threadFolderMap: {} };
  }
}

export function saveFolderState(scope: string, state: ThreadFolderState): void {
  try {
    localStorage.setItem(getStorageKey(scope), JSON.stringify(state));
    window.dispatchEvent(new CustomEvent("bark-folders-changed", { detail: scope }));
  } catch {
    // localStorage might be unavailable or disabled
  }
}

export function createFolder(scope: string, name: string): ThreadFolder {
  const current = loadFolderState(scope);
  const trimmed = name.trim() || "New Folder";
  const newFolder: ThreadFolder = {
    id: `folder_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: trimmed,
    collapsed: false,
    createdAt: new Date().toISOString(),
  };
  const updated: ThreadFolderState = {
    ...current,
    folders: [...current.folders, newFolder],
  };
  saveFolderState(scope, updated);
  return newFolder;
}

export function renameFolder(scope: string, folderId: string, name: string): void {
  const current = loadFolderState(scope);
  const trimmed = name.trim();
  if (!trimmed) return;
  const updated: ThreadFolderState = {
    ...current,
    folders: current.folders.map((f) => (f.id === folderId ? { ...f, name: trimmed } : f)),
  };
  saveFolderState(scope, updated);
}

export function deleteFolder(scope: string, folderId: string): void {
  const current = loadFolderState(scope);
  const updatedMap = { ...current.threadFolderMap };
  for (const [threadId, fId] of Object.entries(updatedMap)) {
    if (fId === folderId) {
      delete updatedMap[threadId];
    }
  }
  const updated: ThreadFolderState = {
    folders: current.folders.filter((f) => f.id !== folderId),
    threadFolderMap: updatedMap,
  };
  saveFolderState(scope, updated);
}

export function toggleFolderCollapsed(scope: string, folderId: string): void {
  const current = loadFolderState(scope);
  const updated: ThreadFolderState = {
    ...current,
    folders: current.folders.map((f) =>
      f.id === folderId ? { ...f, collapsed: !f.collapsed } : f
    ),
  };
  saveFolderState(scope, updated);
}

export function moveThreadsToFolder(
  scope: string,
  threadIds: string[],
  folderId: string | null
): void {
  const current = loadFolderState(scope);
  const updatedMap = { ...current.threadFolderMap };
  for (const tid of threadIds) {
    if (folderId) {
      updatedMap[tid] = folderId;
    } else {
      delete updatedMap[tid];
    }
  }
  const updated: ThreadFolderState = {
    ...current,
    threadFolderMap: updatedMap,
  };
  saveFolderState(scope, updated);
}
