export interface ProjectBadgeConfig {
  initials: string;
  isScratch: boolean;
  isCustomIcon?: "loop" | "folder";
  bgClass: string;
  textClass: string;
  borderClass: string;
}

const PALETTES = [
  {
    bgClass: "bg-[#381547]",
    textClass: "text-[#e9bbfd]",
    borderClass: "border-[#7e22ce]/50",
  },
  {
    bgClass: "bg-[#45131a]",
    textClass: "text-[#fda4af]",
    borderClass: "border-[#e11d48]/50",
  },
  {
    bgClass: "bg-[#143026]",
    textClass: "text-[#6ee7b7]",
    borderClass: "border-[#059669]/50",
  },
  {
    bgClass: "bg-[#142642]",
    textClass: "text-[#93c5fd]",
    borderClass: "border-[#2563eb]/50",
  },
  {
    bgClass: "bg-[#3b2311]",
    textClass: "text-[#fcd34d]",
    borderClass: "border-[#d97706]/50",
  },
  {
    bgClass: "bg-[#291642]",
    textClass: "text-[#c4b5fd]",
    borderClass: "border-[#6366f1]/50",
  },
  {
    bgClass: "bg-[#133238]",
    textClass: "text-[#67e8f9]",
    borderClass: "border-[#0891b2]/50",
  },
];

function stringHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function getProjectBadge(projectName?: string | null): ProjectBadgeConfig {
  const raw = (projectName || "").trim();
  const lower = raw.toLowerCase();

  if (!raw || lower === "no project" || lower === "scratch" || lower === "__scratch__") {
    return {
      initials: "",
      isScratch: true,
      bgClass: "bg-transparent",
      textClass: "text-muted-dim",
      borderClass: "border-dashed border-border-strong",
    };
  }

  // Exact matches for the user's projects
  if (lower === "barkcli") {
    return {
      initials: "BI",
      isScratch: false,
      bgClass: "bg-[#381547]",
      textClass: "text-[#e9bbfd]",
      borderClass: "border-[#7e22ce]/50",
    };
  }

  if (lower === "ses") {
    return {
      initials: "SS",
      isScratch: false,
      bgClass: "bg-[#45131a]",
      textClass: "text-[#fda4af]",
      borderClass: "border-[#e11d48]/50",
    };
  }

  if (lower === "skilluply") {
    return {
      initials: "",
      isScratch: false,
      isCustomIcon: "loop",
      bgClass: "bg-[#1e2025]",
      textClass: "text-white",
      borderClass: "border-border",
    };
  }

  // Tokens splitting
  const tokens = raw.split(/[\s\-_\/]+/).filter(Boolean);
  let initials = "";
  if (tokens.length >= 2) {
    initials = (tokens[0][0] + tokens[1][0]).toUpperCase();
  } else if (raw.length >= 2) {
    initials = (raw[0] + raw[raw.length - 1]).toUpperCase();
  } else {
    initials = raw.toUpperCase();
  }

  const palette = PALETTES[stringHash(lower) % PALETTES.length];
  return {
    initials,
    isScratch: false,
    ...palette,
  };
}
