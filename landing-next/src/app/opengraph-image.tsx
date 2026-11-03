import { ImageResponse } from "next/og";

// Required for `output: "export"` (GitHub Pages) — the image is only re-rendered statically.
export const dynamic = "force-static";

export const alt =
  "barkcli — The management layer for AI agents: CLI, TUI, and web app.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const BROWN = "#B8845C";

function DogFace({ size: s, color = BROWN }: { size: number; color?: string }) {
  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 100 100"
      fill="none"
    >
      <rect x="2" y="2" width="96" height="96" rx="22" fill="#181A20" stroke="rgba(255,255,255,0.18)" strokeWidth="1.5" />
      <g stroke={color} strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M 30 25 C 42 18, 58 18, 70 25" />
        <path d="M 30 25 C 16 27, 11 39, 12 51 C 13 60, 21 61, 27 53 C 30 48, 30 41, 30 35" />
        <path d="M 70 25 C 84 27, 89 39, 88 51 C 87 60, 79 61, 73 53 C 70 48, 70 41, 70 35" />
        <path d="M 30 43 C 26 56, 28 67, 35 74 C 41 79.5, 59 79.5, 65 74 C 72 67, 74 56, 70 43" />
        <path d="M 43.5 55 C 47 52.5, 53 52.5, 56.5 55 C 55 59.5, 52 63, 50 64 C 48 63, 45 59.5, 43.5 55 Z" fill={color} stroke="none" />
        <path d="M 50 64 L 50 70 M 44.5 70 C 47.5 72.5, 52.5 72.5, 55.5 70" strokeWidth="5" />
      </g>
    </svg>
  );
}

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "#0A0A0A",
          padding: "72px 88px",
          fontFamily: "geist",
          color: "#fff",
        }}
      >
        <div style={{ display: "flex", flex: 1, alignItems: "center", gap: 64 }}>
          <DogFace size={340} />
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              minWidth: 0,
            }}
          >
            <div style={{ fontSize: 108, letterSpacing: -3 }}>barkcli</div>
            <div style={{ fontSize: 46, color: "rgba(255,255,255,0.82)" }}>
              Tasks in your repo.
            </div>
            <div
              style={{
                display: "flex",
                gap: 14,
                marginTop: 20,
                fontSize: 26,
                color: "rgba(255,255,255,0.55)",
                letterSpacing: 0.5,
              }}
            >
              <span>CLI</span>
              <span>·</span>
              <span>TUI</span>
              <span>·</span>
              <span>WEB</span>
              <span>·</span>
              <span>VS CODE</span>
            </div>
          </div>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 24,
            color: "rgba(255,255,255,0.5)",
            letterSpacing: 1,
          }}
        >
          <span>MANAGEMENT LAYER FOR AI AGENTS · NO CLOUD · MIT</span>
          <span>github.com/AkshatNaruka/barkcli</span>
        </div>
      </div>
    ),
    size,
  );
}
