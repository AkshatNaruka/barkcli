import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { SURFACES, type Surface } from "./surfaces";

/**
 * Appearance is a complete look, not a light/dark switch: four designed
 * themes, seven accent families, an icon/label rail, and a surface order the
 * user owns. Everything is one JSON object so it can be shared as a link.
 */

export type Theme = "black" | "slate" | "neon" | "light" | "system";
export type AccentId = "copper" | "amber" | "moss" | "sky" | "iris" | "rose" | "steel";
export type RailStyle = "icons" | "labels";

export interface Appearance {
  theme: Theme;
  accent: AccentId;
  railStyle: RailStyle;
  railOrder: Surface[];
  hidden: Surface[];
}

const STORAGE_KEY = "barkcli-appearance-v1";
const LEGACY_THEME_KEY = "barkcli-theme";

interface Palette {
  bg: string;
  surface: string;
  card: string;
  cardHover: string;
  border: string;
  borderStrong: string;
  text: string;
  muted: string;
  mutedStrong: string;
  scrollbar: string;
  scrim: string;
  shadow: string;
}

const PALETTES: Record<"black" | "slate" | "neon" | "light", Palette> = {
  black: {
    bg: "#0a0908",
    surface: "#100e0c",
    card: "#16130f",
    cardHover: "#1c1814",
    border: "#272119",
    borderStrong: "#3b3227",
    text: "#efe9e1",
    muted: "#988d7f",
    mutedStrong: "#c9beb0",
    scrollbar: "#3b3227",
    scrim: "rgba(0, 0, 0, 0.72)",
    shadow: "0 12px 34px rgba(0, 0, 0, 0.55)",
  },
  slate: {
    bg: "#0a0c10",
    surface: "#101319",
    card: "#161a21",
    cardHover: "#1c212a",
    border: "#242b36",
    borderStrong: "#35404f",
    text: "#e9edf4",
    muted: "#8b95a6",
    mutedStrong: "#c4ccda",
    scrollbar: "#35404f",
    scrim: "rgba(0, 0, 0, 0.72)",
    shadow: "0 12px 34px rgba(0, 0, 0, 0.5)",
  },
  neon: {
    bg: "#060807",
    surface: "#0b0f0c",
    card: "#111611",
    cardHover: "#161d16",
    border: "#1d281e",
    borderStrong: "#2e3f2f",
    text: "#e6f0e4",
    muted: "#7f927b",
    mutedStrong: "#bdd0b7",
    scrollbar: "#2e3f2f",
    scrim: "rgba(0, 0, 0, 0.74)",
    shadow: "0 12px 34px rgba(0, 0, 0, 0.5)",
  },
  light: {
    bg: "#fbfaf8",
    surface: "#f5f2ed",
    card: "#ffffff",
    cardHover: "#f7f4ef",
    border: "#e7e1d8",
    borderStrong: "#d5cdc1",
    text: "#1a1714",
    muted: "#726a60",
    mutedStrong: "#443e37",
    scrollbar: "#d5cdc1",
    scrim: "rgba(20, 15, 10, 0.32)",
    shadow: "0 10px 30px rgba(40, 30, 20, 0.12)",
  },
};

export const THEMES: Array<{
  id: Theme;
  label: string;
  hint: string;
  preview: [string, string, string];
  system?: boolean;
}> = [
  {
    id: "black",
    label: "Bark",
    hint: "Warm charcoal, copper",
    preview: ["#0a0908", "#16130f", "#c2703d"],
  },
  {
    id: "slate",
    label: "Slate",
    hint: "Cool graphite, sky",
    preview: ["#0a0c10", "#161a21", "#5aa7cf"],
  },
  {
    id: "neon",
    label: "Terminal",
    hint: "Near-black, moss",
    preview: ["#060807", "#111611", "#8fae5e"],
  },
  {
    id: "light",
    label: "Paper",
    hint: "Warm light, ink",
    preview: ["#fbfaf8", "#ffffff", "#b06434"],
  },
  {
    id: "system",
    label: "Auto",
    hint: "Follow the OS",
    preview: ["#0a0908", "#fbfaf8", "#9aa3ad"],
    system: true,
  },
];

const ACCENTS: Record<AccentId, { label: string; dark: string; light: string }> = {
  copper: { label: "Copper", dark: "#c2703d", light: "#b06434" },
  amber: { label: "Amber", dark: "#d9a03c", light: "#a86a10" },
  moss: { label: "Moss", dark: "#8fae5e", light: "#5c7a2e" },
  sky: { label: "Sky", dark: "#5aa7cf", light: "#2f7fa8" },
  iris: { label: "Iris", dark: "#9484e0", light: "#6b58c9" },
  rose: { label: "Rose", dark: "#d87a90", light: "#b04a64" },
  steel: { label: "Steel", dark: "#9aa3ad", light: "#59626c" },
};

export const ACCENT_IDS = Object.keys(ACCENTS) as AccentId[];

export function accentLabel(id: AccentId): string {
  return ACCENTS[id].label;
}

export function accentColor(id: AccentId, mode: "dark" | "light"): string {
  return ACCENTS[id][mode];
}

const DEFAULT_ACCENT: Record<Theme, AccentId> = {
  black: "copper",
  slate: "sky",
  neon: "moss",
  light: "copper",
  system: "copper",
};

export const DEFAULT_APPEARANCE: Appearance = {
  theme: "black",
  accent: "copper",
  railStyle: "icons",
  railOrder: SURFACES.map((s) => s.id),
  hidden: [],
};

const SURFACE_IDS = SURFACES.map((s) => s.id);

function isSurfaceId(value: unknown): value is Surface {
  return typeof value === "string" && (SURFACE_IDS as string[]).includes(value);
}

export function normalizeAppearance(input: unknown): Appearance {
  const data = (input ?? {}) as Partial<Appearance>;
  const theme = THEMES.some((t) => t.id === data.theme) ? (data.theme as Theme) : "black";
  const accent = ACCENT_IDS.includes(data.accent as AccentId)
    ? (data.accent as AccentId)
    : DEFAULT_ACCENT[theme];
  const railStyle: RailStyle = data.railStyle === "labels" ? "labels" : "icons";

  const order: Surface[] = [];
  if (Array.isArray(data.railOrder)) {
    for (const id of data.railOrder) {
      if (isSurfaceId(id) && !order.includes(id)) order.push(id);
    }
  }
  for (const id of SURFACE_IDS) if (!order.includes(id)) order.push(id);

  const hidden: Surface[] = [];
  if (Array.isArray(data.hidden)) {
    for (const id of data.hidden) {
      if (isSurfaceId(id) && !hidden.includes(id)) hidden.push(id);
    }
  }
  // At least one surface must remain reachable.
  if (hidden.length >= SURFACE_IDS.length) hidden.splice(1);

  return { theme, accent, railStyle, railOrder: order, hidden };
}

/** Decode a share URL, raw base64, or a JSON object. */
function encodeBase64(text: string): string {
  return btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeBase64(text: string): string {
  const normalized = text.replace(/-/g, "+").replace(/_/g, "/");
  return atob(normalized + "=".repeat((4 - (normalized.length % 4)) % 4));
}

export function parseAppearance(raw: string): Appearance | null {
  const text = raw.trim();
  if (!text) return null;

  try {
    return normalizeAppearance(JSON.parse(text));
  } catch {}

  let encoded = text;
  try {
    const url = new URL(text);
    encoded = url.searchParams.get("preset") ?? "";
  } catch {}
  if (!encoded) return null;

  try {
    return normalizeAppearance(JSON.parse(decodeBase64(encoded)));
  } catch {
    return null;
  }
}

export function encodeAppearance(app: Appearance): string {
  return encodeBase64(JSON.stringify(app));
}

/** A portable link that carries the look, never the server token. */
export function shareUrl(app: Appearance): string {
  const url = new URL(window.location.href);
  url.searchParams.delete("token");
  url.searchParams.set("preset", encodeAppearance(app));
  url.hash = "#/chat";
  return url.toString();
}

function loadAppearance(): Appearance {
  if (typeof window === "undefined") return DEFAULT_APPEARANCE;

  let fromUrl: unknown = null;
  try {
    const preset = new URLSearchParams(window.location.search).get("preset");
    if (preset) fromUrl = JSON.parse(decodeBase64(preset));
  } catch {}

  let stored: unknown = null;
  try {
    stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
  } catch {}

  if (fromUrl || stored) return normalizeAppearance(fromUrl ?? stored);

  // One-time migration from the old three-way theme switch.
  try {
    const legacy = localStorage.getItem(LEGACY_THEME_KEY);
    if (legacy === "light" || legacy === "system" || legacy === "black") {
      return normalizeAppearance({ theme: legacy, accent: DEFAULT_ACCENT[legacy] });
    }
  } catch {}

  return DEFAULT_APPEARANCE;
}

function resolvedMode(theme: Theme): "dark" | "light" {
  if (theme === "light") return "light";
  if (theme === "system") {
    try {
      return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
    } catch {
      return "dark";
    }
  }
  return "dark";
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function rgbTriplet(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  return `${r} ${g} ${b}`;
}

function mix(hex: string, target: "white" | "black", amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  const to = target === "white" ? 255 : 0;
  const m = (c: number) => Math.round(c + (to - c) * amount);
  return `#${[m(r), m(g), m(b)].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

function applyAppearance(app: Appearance) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const mode = resolvedMode(app.theme);
  const paletteKey: keyof typeof PALETTES =
    app.theme === "light" || (app.theme === "system" && mode === "light")
      ? "light"
      : app.theme === "slate"
        ? "slate"
        : app.theme === "neon"
          ? "neon"
          : "black";
  const palette = PALETTES[paletteKey];

  root.dataset.theme = mode === "light" ? "light" : "black";
  root.dataset.appTheme = app.theme;
  root.dataset.rail = app.railStyle;
  root.style.colorScheme = mode;

  const vars: Record<string, string> = {
    "--bg": palette.bg,
    "--bg-rgb": rgbTriplet(palette.bg),
    "--surface": palette.surface,
    "--surface-rgb": rgbTriplet(palette.surface),
    "--card": palette.card,
    "--card-rgb": rgbTriplet(palette.card),
    "--card-hover": palette.cardHover,
    "--card-hover-rgb": rgbTriplet(palette.cardHover),
    "--border": palette.border,
    "--border-rgb": rgbTriplet(palette.border),
    "--border-strong": palette.borderStrong,
    "--border-strong-rgb": rgbTriplet(palette.borderStrong),
    "--text": palette.text,
    "--text-rgb": rgbTriplet(palette.text),
    "--muted": palette.muted,
    "--muted-rgb": rgbTriplet(palette.muted),
    "--muted-strong": palette.mutedStrong,
    "--muted-strong-rgb": rgbTriplet(palette.mutedStrong),
    "--scrollbar": palette.scrollbar,
    "--scrim": palette.scrim,
    "--shadow": palette.shadow,
  };

  const base = ACCENTS[app.accent][mode];
  const [r, g, b] = hexToRgb(base);
  const accentHover = mix(base, mode === "light" ? "black" : "white", 0.1);
  const accentText = mix(base, mode === "light" ? "black" : "white", mode === "light" ? 0.18 : 0.3);
  vars["--accent"] = base;
  vars["--accent-rgb"] = `${r} ${g} ${b}`;
  vars["--accent-hover"] = accentHover;
  vars["--accent-hover-rgb"] = rgbTriplet(accentHover);
  vars["--accent-soft"] = `rgba(${r}, ${g}, ${b}, ${mode === "light" ? 0.12 : 0.14})`;
  vars["--accent-text"] = accentText;
  vars["--accent-text-rgb"] = rgbTriplet(accentText);

  for (const [key, value] of Object.entries(vars)) {
    root.style.setProperty(key, value);
  }
}

interface AppearanceContextValue extends Appearance {
  setTheme: (t: Theme) => void;
  setAccent: (a: AccentId) => void;
  setRailStyle: (r: RailStyle) => void;
  moveSurface: (id: Surface, direction: -1 | 1) => void;
  toggleSurface: (id: Surface) => void;
  setAppearance: (next: Partial<Appearance>) => void;
  reset: () => void;
}

const AppearanceContext = createContext<AppearanceContextValue>({
  ...DEFAULT_APPEARANCE,
  setTheme: () => {},
  setAccent: () => {},
  setRailStyle: () => {},
  moveSurface: () => {},
  toggleSurface: () => {},
  setAppearance: () => {},
  reset: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [app, setApp] = useState<Appearance>(loadAppearance);

  useEffect(() => {
    applyAppearance(app);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(app));
    } catch {}
  }, [app]);

  // Strip the shared preset after applying it, keeping the token/hash intact.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.has("preset")) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("preset");
    window.history.replaceState(null, "", url.toString());
  }, []);

  // Auto mode follows the OS live, not just on reload.
  useEffect(() => {
    if (app.theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => applyAppearance(app);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [app]);

  const setTheme = useCallback((theme: Theme) => {
    setApp((prev) => ({ ...prev, theme, accent: DEFAULT_ACCENT[theme] }));
  }, []);

  const setAccent = useCallback((accent: AccentId) => {
    setApp((prev) => ({ ...prev, accent }));
  }, []);

  const setRailStyle = useCallback((railStyle: RailStyle) => {
    setApp((prev) => ({ ...prev, railStyle }));
  }, []);

  const moveSurface = useCallback((id: Surface, direction: -1 | 1) => {
    setApp((prev) => {
      const visible = prev.railOrder.filter((s) => !prev.hidden.includes(s));
      const at = visible.indexOf(id);
      const swap = visible[at + direction];
      if (at < 0 || !swap) return prev;
      const order = [...prev.railOrder];
      const i = order.indexOf(id);
      const j = order.indexOf(swap);
      [order[i], order[j]] = [order[j], order[i]];
      return { ...prev, railOrder: order };
    });
  }, []);

  const toggleSurface = useCallback((id: Surface) => {
    setApp((prev) => {
      const isHidden = prev.hidden.includes(id);
      if (!isHidden) {
        const visible = prev.railOrder.filter((s) => !prev.hidden.includes(s));
        if (visible.length <= 1) return prev;
        return { ...prev, hidden: [...prev.hidden, id] };
      }
      return { ...prev, hidden: prev.hidden.filter((s) => s !== id) };
    });
  }, []);

  const setAppearance = useCallback((next: Partial<Appearance>) => {
    setApp((prev) => normalizeAppearance({ ...prev, ...next }));
  }, []);

  const reset = useCallback(() => {
    setApp(DEFAULT_APPEARANCE);
    try {
      localStorage.removeItem(LEGACY_THEME_KEY);
    } catch {}
  }, []);

  const value = useMemo<AppearanceContextValue>(
    () => ({
      ...app,
      setTheme,
      setAccent,
      setRailStyle,
      moveSurface,
      toggleSurface,
      setAppearance,
      reset,
    }),
    [app, setTheme, setAccent, setRailStyle, moveSurface, toggleSurface, setAppearance, reset]
  );

  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}

export function useTheme() {
  return useContext(AppearanceContext);
}
