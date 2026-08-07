import { ImageResponse } from "next/og";

export const alt =
  "barkcli — Tasks in your repo. Git-native kanban board: CLI, TUI, web and VS Code.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const BROWN = "#B8845C";

function DogFace({ size: s, color = BROWN }: { size: number; color?: string }) {
  const strokeWidth = 5.5 * (s / 100);
  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 100 100"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M29 24 Q14 27 11 42 Q10 54 19 59 Q27 56 30 47" />
      <path d="M71 24 Q86 27 89 42 Q90 54 81 59 Q73 56 70 47" />
      <path d="M29 24 Q50 15 71 24" />
      <path d="M30 47 Q26 61 30 71 Q34 83 50 83 Q66 83 70 71 Q74 61 70 47" />
      <path d="M50 59 Q45 54 41.5 60 Q41.5 67 50 72 Q58.5 67 58.5 60 Q55 54 50 59" />
      <path d="M50 74 L50 78 M45 78.5 Q50 81.5 55 78.5" />
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
          <span>GIT-NATIVE KANBAN · NO CLOUD · MIT</span>
          <span>barkcli.vercel.app</span>
        </div>
      </div>
    ),
    size,
  );
}
