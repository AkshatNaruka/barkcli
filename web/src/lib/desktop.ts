/**
 * The desktop shell (Tauri) injects `window.__TAURI__` because the webview
 * loads the local server over http://127.0.0.1. We deliberately do not add a
 * JS package: the bridge is small, optional, and the browser build must keep
 * working without it.
 */

import type { ProjectSummary } from "./types";

export interface DesktopProject {
  path: string;
  name: string;
}

interface TauriInvoke {
  (command: string, args?: Record<string, unknown>): Promise<unknown>;
}

interface TauriEvent<T> {
  payload: T;
}

interface TauriBridge {
  core?: { invoke?: TauriInvoke };
  event?: {
    listen?: <T>(
      event: string,
      handler: (event: TauriEvent<T>) => void
    ) => Promise<() => void>;
  };
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

/** Best-effort OS detection for the desktop shell. */
export function platform(): "macos" | "windows" | "linux" | "web" {
  if (typeof navigator === "undefined") return "web";
  const value = navigator.platform.toLowerCase();
  if (value.includes("mac")) return "macos";
  if (value.includes("win")) return "windows";
  if (value.includes("linux")) return "linux";
  return "web";
}

export function isMac(): boolean {
  return platform() === "macos";
}

async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T | null> {
  const fn = bridge()?.core?.invoke ?? bridge()?.__TAURI_INTERNALS__?.invoke;
  if (!fn) return null;
  try {
    return (await fn(command, args)) as T;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[desktop] ${command} failed`, error);
    // Surface failures instead of silently turning every desktop action into a
    // no-op. The shell renders this as a toast with the command that failed.
    window.dispatchEvent(
      new CustomEvent("bark-desktop-error", { detail: { command, message } })
    );
    return null;
  }
}

export async function openProjectDialog(): Promise<DesktopProject | null> {
  return invoke<DesktopProject | null>("open_project_dialog");
}

export async function switchProject(
  path: string,
  target?: "chat" | "review" | "projects" | "hub"
): Promise<DesktopProject | null> {
  return invoke<DesktopProject | null>("switch_project", target ? { path, target } : { path });
}

export async function currentProject(): Promise<DesktopProject | null> {
  return invoke<DesktopProject | null>("current_project");
}

export async function recentProjects(): Promise<DesktopProject[]> {
  return (await invoke<DesktopProject[]>("recent_projects")) ?? [];
}

export async function savedProjects(): Promise<DesktopProject[]> {
  return (await invoke<DesktopProject[]>("saved_projects")) ?? [];
}

export async function saveProject(path: string): Promise<DesktopProject | null> {
  return invoke<DesktopProject>("save_project", { path });
}

export async function removeSavedProject(path: string): Promise<boolean> {
  const result = await invoke<void>("remove_saved_project", { path });
  return result !== null || true;
}

/** App preferences survive the sidecar's per-launch port and project changes. */
export async function loadSidebarLayout(): Promise<unknown> {
  return invoke<unknown>("sidebar_layout_get");
}

export async function saveSidebarLayout(layout: unknown): Promise<void> {
  await invoke<void>("sidebar_layout_set", { layout });
}

export async function projectSummaries(): Promise<ProjectSummary[]> {
  return (await invoke<ProjectSummary[]>("project_summaries")) ?? [];
}

export async function revealProject(path?: string): Promise<boolean> {
  return (await invoke<boolean>("reveal_project", path ? { path } : {})) ?? false;
}

/** Open the official provider login command in a terminal window. */
export async function openProviderLogin(provider: string): Promise<boolean> {
  return (await invoke<boolean>("open_provider_login", { provider })) ?? false;
}

/** Open a native terminal at the project root (or a supplied folder). */
export async function openTerminal(path?: string): Promise<boolean> {
  return (await invoke<boolean>("open_terminal", path ? { path } : {})) ?? false;
}

/** Open the sidecar log in the default log viewer. */
export async function openLogs(): Promise<boolean> {
  return (await invoke<boolean>("open_logs")) ?? false;
}

/** Post a native macOS notification. No-op outside the desktop shell. */
export async function notify(title: string, body: string): Promise<boolean> {
  return (await invoke<boolean>("notify", { title, body })) ?? false;
}

/** Listen for native menu commands. Returns a cleanup function. */
export async function onMenu(
  handler: (id: string) => void
): Promise<() => void> {
  const listen = bridge()?.event?.listen;
  if (!listen) return () => {};
  try {
    return await listen<string>("bark-menu", (event) => handler(event.payload));
  } catch {
    return () => {};
  }
}
