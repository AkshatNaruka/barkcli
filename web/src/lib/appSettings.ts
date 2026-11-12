export interface GeneralSettings {
  defaultEditor: "vscode" | "cursor" | "rider" | "sublime" | "terminal" | "finder";
  notifications: boolean;
  autoSave: boolean;
  telemetry: boolean;
}

export interface ApiKeySettings {
  anthropicKey: string;
  openaiKey: string;
  geminiKey: string;
  openrouterKey: string;
  ollamaEndpoint: string;
  /** Provider pre-selected in the composer for new conversations. */
  defaultBackend: string;
  /** Model pre-selected for that provider. */
  defaultModel: string;
}

export interface TerminalSettings {
  shell: string;
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  cursorStyle: "block" | "bar" | "underline";
  envVars: Array<{ key: string; value: string }>;
}

/** The shape the server stores in `~/.bark/settings.json`. */
export interface StoredSettings {
  general: GeneralSettings;
  apiKeys: ApiKeySettings;
  terminal: TerminalSettings;
  mcpServers: unknown[];
}

export const DEFAULT_GENERAL_SETTINGS: GeneralSettings = {
  defaultEditor: "vscode",
  notifications: true,
  autoSave: true,
  telemetry: false,
};

export const DEFAULT_API_KEY_SETTINGS: ApiKeySettings = {
  anthropicKey: "",
  openaiKey: "",
  geminiKey: "",
  openrouterKey: "",
  ollamaEndpoint: "http://127.0.0.1:11434",
  defaultBackend: "",
  defaultModel: "",
};

export const DEFAULT_TERMINAL_SETTINGS: TerminalSettings = {
  shell: "/bin/zsh",
  fontFamily: "JetBrains Mono",
  fontSize: 13,
  lineHeight: 1.5,
  cursorStyle: "block",
  envVars: [
    { key: "RUST_LOG", value: "info" },
    { key: "COLORTERM", value: "truecolor" },
  ],
};

const GENERAL_KEY = "barkcli-settings-general-v1";
const API_KEYS_KEY = "barkcli-settings-apikeys-v1";
const TERMINAL_KEY = "barkcli-settings-terminal-v1";

function loadFromStorage<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return { ...fallback, ...JSON.parse(raw) };
  } catch {
    return fallback;
  }
}

function saveToStorage<T>(key: string, data: T): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {}
}

export function loadGeneralSettings(): GeneralSettings {
  return loadFromStorage(GENERAL_KEY, DEFAULT_GENERAL_SETTINGS);
}

export function saveGeneralSettings(s: GeneralSettings): void {
  saveToStorage(GENERAL_KEY, s);
}

export function loadApiKeySettings(): ApiKeySettings {
  return loadFromStorage(API_KEYS_KEY, DEFAULT_API_KEY_SETTINGS);
}

export function saveApiKeySettings(s: ApiKeySettings): void {
  saveToStorage(API_KEYS_KEY, s);
}

export function loadTerminalSettings(): TerminalSettings {
  return loadFromStorage(TERMINAL_KEY, DEFAULT_TERMINAL_SETTINGS);
}

export function saveTerminalSettings(s: TerminalSettings): void {
  saveToStorage(TERMINAL_KEY, s);
}

/**
 * Write a server payload into the local cache.
 *
 * The cache exists for two reasons: synchronous readers (`openInEditor`, the
 * composer default) cannot await a request, and the browser build can still
 * render before the first fetch resolves. The server copy stays authoritative.
 */
export function cacheSettings(settings: StoredSettings): void {
  saveGeneralSettings(settings.general);
  saveApiKeySettings(settings.apiKeys);
  saveTerminalSettings(settings.terminal);
}

/** The cached settings in server shape, used when the server is unreachable. */
export function cachedSettings(mcpServers: unknown[] = []): StoredSettings {
  return {
    general: loadGeneralSettings(),
    apiKeys: loadApiKeySettings(),
    terminal: loadTerminalSettings(),
    mcpServers,
  };
}
