import React from "react";

// ── Inline SVG icon set (DESIGN.md §4, emoji-purge plan) ──
// Stroke-based, currentColor, 24 viewBox. Zero dependencies.

const PATHS: Record<string, React.ReactNode> = {
  search: <circle cx="11" cy="11" r="7" />,
  searchLine: <line x1="16.5" y1="16.5" x2="21" y2="21" />,
  pin: <path d="M9 4h6l1 7 3 3v2H5v-2l3-3V4z" />,
  pinLine: <line x1="12" y1="16" x2="12" y2="21" />,
  pencil: <path d="M4 20l1-4L16.5 4.5a2.1 2.1 0 013 3L8 19l-4 1z" />,
  copy: <rect x="9" y="9" width="11" height="11" rx="2" />,
  copyBack: <path d="M5 15V5a2 2 0 012-2h10" />,
  history: <path d="M3 12a9 9 0 109-9 9.7 9.7 0 00-7 3.3L3 8" />,
  historyHands: <path d="M12 7v5l3 2" />,
  pulse: <path d="M3 12h4l3-8 4 16 3-8h4" />,
  trash: <path d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m3 0l-.8 12.2a1 1 0 01-1 .8H7.8a1 1 0 01-1-.8L6 7" />,
  comment: <path d="M21 12a8 8 0 01-8 8H4l2-3a8 8 0 1115-5z" />,
  blocked: <circle cx="12" cy="12" r="9" />,
  blockedBar: <line x1="6" y1="6" x2="18" y2="18" />,
  clock: <circle cx="12" cy="12" r="9" />,
  clockHands: <path d="M12 7v5l3 2" />,
  calendar: <rect x="4" y="5" width="16" height="16" rx="2" />,
  calendarTop: <path d="M4 10h16M8 3v4M16 3v4" />,
  warn: <path d="M12 3L2 21h20L12 3z" />,
  warnMark: <path d="M12 10v5" />,
  warnDot: <circle cx="12" cy="17.5" r="0.5" />,
  subtasks: <path d="M4 6h6M4 12h6M4 18h6" />,
  subtasksBox: <rect x="14" y="13" width="7" height="7" rx="1.5" />,
  check: <path d="M4 12.5l5 5L20 6.5" />,
  refresh: <path d="M21 12a9 9 0 11-2.6-6.4" />,
  refreshArrow: <path d="M21 3v6h-6" />,
  bell: <path d="M6 9a6 6 0 0112 0c0 5 2 6 2 6H4s2-1 2-6" />,
  bellDot: <path d="M10 20a2 2 0 004 0" />,
  gear: <circle cx="12" cy="12" r="3" />,
  gearTeeth: <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1" />,
  robot: <rect x="5" y="9" width="14" height="10" rx="2" />,
  robotTop: <path d="M12 9V5M8 5h8" />,
  robotEyes: <path d="M9 14h.01M15 14h.01" />,
  doc: <path d="M6 2h8l5 5v15H6V2z" />,
  docFold: <path d="M14 2v5h5" />,
  chart: <path d="M4 20V4" />,
  chartBars: <path d="M9 20v-6M14 20V9M19 20v-9" />,
  board: <rect x="3" y="4" width="18" height="16" rx="2" />,
  boardCols: <path d="M9 4v16M15 4v16" />,
  spark: <path d="M12 2l2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4L12 2z" />,
  layers: <path d="M12 3l9 5-9 5-9-5 9-5z" />,
  layersUnder: <path d="M3 13l9 5 9-5" />,
  cycle: <path d="M20 12a8 8 0 11-2.3-5.6" />,
  cycleArrow: <path d="M20 3v5h-5" />,
  code: <path d="M8 6L3 12l5 6M16 6l5 6-5 6" />,
  db: <ellipse cx="12" cy="5" rx="8" ry="3" />,
  dbBody: <path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5" />,
  dbMid: <path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />,
  star: <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3z" />,
  chevL: <path d="M14 6l-6 6 6 6" />,
  chevR: <path d="M10 6l6 6-6 6" />,
  flag: <path d="M5 21V4" />,
  flagWave: <path d="M5 4h13l-3 4 3 4H5" />,
  link: <path d="M10 14a5 5 0 007.1 0l2.4-2.4a5 5 0 00-7.1-7.1L11 5.9" />,
  linkUnder: <path d="M14 10a5 5 0 00-7.1 0l-2.4 2.4a5 5 0 007.1 7.1L13 18.1" />,
  moon: <path d="M20 14.5A8.5 8.5 0 019.5 4 8.5 8.5 0 1020 14.5z" />,
  sun: <circle cx="12" cy="12" r="4" />,
  sunRays: <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" />,
  monitor: <rect x="3" y="4" width="18" height="12" rx="2" />,
  monitorStand: <path d="M9 20h6M12 16v4" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  users: <circle cx="9" cy="8" r="3.5" />,
  usersBody: <path d="M2.5 20a6.5 6.5 0 0113 0" />,
  usersSide: <path d="M16 5a3.5 3.5 0 010 6.8M18.5 14.2a6.5 6.5 0 013 5.8" />,
  inbox: <path d="M3 13l2.7-8h12.6L21 13v6H3v-6z" />,
  inboxSlot: <path d="M3 13h6l1.5 2.5h3L15 13h6" />,
  arrowUp: <path d="M12 19V5M5 12l7-7 7 7" />,
  arrowFlat: <path d="M5 12h14" />,
  arrowDown: <path d="M12 5v14M5 12l7 7 7-7" />,
};

// Icons composed of multiple sub-paths.
const GROUPS: Record<string, string[]> = {
  search: ["search", "searchLine"],
  pin: ["pin", "pinLine"],
  copy: ["copy", "copyBack"],
  history: ["history", "historyHands"],
  clock: ["clock", "clockHands"],
  calendar: ["calendar", "calendarTop"],
  warn: ["warn", "warnMark", "warnDot"],
  subtasks: ["subtasks", "subtasksBox"],
  refresh: ["refresh", "refreshArrow"],
  bell: ["bell", "bellDot"],
  gear: ["gear", "gearTeeth"],
  robot: ["robot", "robotTop", "robotEyes"],
  doc: ["doc", "docFold"],
  chart: ["chart", "chartBars"],
  board: ["board", "boardCols"],
  layers: ["layers", "layersUnder"],
  cycle: ["cycle", "cycleArrow"],
  db: ["db", "dbBody", "dbMid"],
  monitor: ["monitor", "monitorStand"],
  sun: ["sun", "sunRays"],
  users: ["users", "usersBody", "usersSide"],
  inbox: ["inbox", "inboxSlot"],
  flag: ["flag", "flagWave"],
  link: ["link", "linkUnder"],
};

export type IconName =
  | "search" | "pin" | "pencil" | "copy" | "history" | "pulse" | "trash"
  | "comment" | "blocked" | "clock" | "calendar" | "warn" | "subtasks"
  | "check" | "refresh" | "bell" | "gear" | "robot" | "doc" | "chart"
  | "board" | "spark" | "layers" | "cycle" | "code" | "db" | "star"
  | "chevL" | "chevR" | "flag" | "link" | "moon" | "sun" | "monitor"
  | "x" | "users" | "inbox" | "arrowUp" | "arrowFlat" | "arrowDown";

function partsFor(name: IconName): React.ReactNode[] {
  if (name === "blocked") return [PATHS["blocked"], PATHS["blockedBar"]];
  if (name === "pencil") return [PATHS["pencil"]];
  if (name === "pulse") return [PATHS["pulse"]];
  if (name === "trash") return [PATHS["trash"]];
  if (name === "comment") return [PATHS["comment"]];
  if (name === "check") return [PATHS["check"]];
  if (name === "spark") return [PATHS["spark"]];
  if (name === "star") return [PATHS["star"]];
  if (name === "code") return [PATHS["code"]];
  if (name === "moon") return [PATHS["moon"]];
  if (name === "x") return [PATHS["x"]];
  if (name === "chevL") return [PATHS["chevL"]];
  if (name === "chevR") return [PATHS["chevR"]];
  if (name === "arrowUp") return [PATHS["arrowUp"]];
  if (name === "arrowFlat") return [PATHS["arrowFlat"]];
  if (name === "arrowDown") return [PATHS["arrowDown"]];
  return (GROUPS[name] || []).map((k) => PATHS[k]);
}

export function Icon({
  name,
  size = 14,
  className = "",
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {partsFor(name).map((p, i) => (
        <React.Fragment key={i}>{p}</React.Fragment>
      ))}
    </svg>
  );
}
