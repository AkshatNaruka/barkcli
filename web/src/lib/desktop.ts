/**
 * The desktop shell (Tauri) injects `window.__TAURI__` because the webview
 * loads the local server over http://127.0.0.1. We deliberately do not add a
 * JS package: the bridge is small, optional, and the browser build must keep
 * working without it.
 */

export interface DesktopProject {
  path: string;
  name: string;
}

interface TauriInvoke {
  (command: string, args?: Record<string, unknown>): Promise<unknown>;
}

interface TauriBridge {
  core?: { invoke?: TauriInvoke };
  __TAURI_INTERNALS__?: { invoke?: TauriInvoke };
}

function bridge(): TauriBridge | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { __TAURI__?: TauriBridge; __TAURI_INTERNALS__?: TauriBridge })
    .__TAURI__ ?? (window as unknown as { __TAURI_INTERNALS__?: TauriBridge }).__TAURI_INTERNALS__ ?? null;
}

export function isDesktop(): boolean {
  return Boolean(bridge());
}

async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T | null> {
  const fn = bridge()?.core?.invoke ?? bridge()?.__TAURI_INTERNALS__?.invoke;
  if (!fn) return null;
  try {
    return (await fn(command, args)) as T;
  } catch (error) {
    console.warn(`[desktop] ${command} failed`, error);
    return null;
  }
}

export async function openProjectDialog(): Promise<DesktopProject | null> {
  return invoke<DesktopProject | null>("open_project_dialog");
}

export async function switchProject(path: string): Promise<DesktopProject | null> {
  return invoke<DesktopProject | null>("switch_project", { path });
}

export async function currentProject(): Promise<DesktopProject | null> {
  return invoke<DesktopProject | null>("current_project");
}

export async function recentProjects(): Promise<DesktopProject[]> {
  return (await invoke<DesktopProject[]>("recent_projects")) ?? [];
}

export async function revealProject(path?: string): Promise<boolean> {
  return (await invoke<boolean>("reveal_project", path ? { path } : {})) ?? false;
}

/** Open the official provider login command in a terminal window. */
export async function openProviderLogin(provider: string): Promise<boolean> {
  return (await invoke<boolean>("open_provider_login", { provider })) ?? false;
}
