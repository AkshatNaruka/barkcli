import { ImageResponse } from "next/og";
import fs from "node:fs";
import path from "node:path";

// Required for `output: "export"` (GitHub Pages) — the image is only re-rendered statically.
export const dynamic = "force-static";

export const alt =
  "barkcli — The management layer for AI agents: intent → plan → worktree → gate → merge.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

function getIconBase64(): string {
  try {
    const iconPath = path.join(process.cwd(), "public/icon-512.png");
    const buffer = fs.readFileSync(iconPath);
    return `data:image/png;base64,${buffer.toString("base64")}`;
  } catch {
    return "";
  }
}

export default function OgImage() {
  const iconSrc = getIconBase64();

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          backgroundColor: "#07080B",
          padding: "68px 80px",
          fontFamily: "system-ui, -apple-system, sans-serif",
          color: "#FFFFFF",
          position: "relative",
        }}
      >
        {/* Subtle warm ambient glow behind the icon */}
        <div
          style={{
            position: "absolute",
            top: 60,
            left: 70,
            width: 440,
            height: 440,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(184, 132, 92, 0.18) 0%, rgba(184, 132, 92, 0) 70%)",
          }}
        />

        {/* Main Content Row */}
        <div style={{ display: "flex", alignItems: "center", gap: 56, flex: 1 }}>
          {/* New High-Craft Mac Squircle Icon */}
          {iconSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={iconSrc}
              alt="barkcli icon"
              width={280}
              height={280}
              style={{
                borderRadius: 62,
                boxShadow: "0 28px 60px -12px rgba(0,0,0,0.85), 0 0 35px rgba(184, 132, 92, 0.25)",
              }}
            />
          ) : (
            <div
              style={{
                width: 280,
                height: 280,
                borderRadius: 62,
                backgroundColor: "#181A20",
                border: "2px solid rgba(184, 132, 92, 0.4)",
              }}
            />
          )}

          {/* Typography & Messaging */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 14,
              minWidth: 0,
              flex: 1,
            }}
          >
            {/* Pill Tag (Snug wrap) */}
            <div style={{ display: "flex" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "6px 14px",
                  borderRadius: 9999,
                  backgroundColor: "rgba(184, 132, 92, 0.12)",
                  border: "1px solid rgba(184, 132, 92, 0.3)",
                  color: "#E5AA7A",
                  fontSize: 15,
                  fontWeight: 600,
                  letterSpacing: 0.8,
                }}
              >
                THE MANAGEMENT LAYER FOR AI AGENTS
              </div>
            </div>

            {/* Wordmark */}
            <div
              style={{
                fontSize: 88,
                fontWeight: 800,
                letterSpacing: -2.5,
                lineHeight: 1,
                color: "#FFFFFF",
              }}
            >
              barkcli
            </div>

            {/* Core Positioning Narrative */}
            <div
              style={{
                fontSize: 27,
                lineHeight: 1.35,
                color: "rgba(255, 255, 255, 0.82)",
                fontWeight: 400,
                maxWidth: 680,
              }}
            >
              Intent in · Plans out · Isolated worktrees · Tests as the gate · Merge train.
            </div>

            {/* Supported Interfaces Pills */}
            <div
              style={{
                display: "flex",
                gap: 10,
                marginTop: 6,
                fontSize: 15,
                color: "rgba(255, 255, 255, 0.65)",
                fontWeight: 500,
              }}
            >
              <span style={{ padding: "4px 10px", borderRadius: 6, backgroundColor: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}>CLI</span>
              <span style={{ padding: "4px 10px", borderRadius: 6, backgroundColor: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}>TUI</span>
              <span style={{ padding: "4px 10px", borderRadius: 6, backgroundColor: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}>macOS App</span>
              <span style={{ padding: "4px 10px", borderRadius: 6, backgroundColor: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}>Web</span>
              <span style={{ padding: "4px 10px", borderRadius: 6, backgroundColor: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}>71 MCP Tools</span>
            </div>
          </div>
        </div>

        {/* Footer Meta Row */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            paddingTop: 22,
            borderTop: "1px solid rgba(255, 255, 255, 0.08)",
            fontSize: 16,
            color: "rgba(255, 255, 255, 0.45)",
            letterSpacing: 0.5,
          }}
        >
          <div style={{ display: "flex", gap: 14 }}>
            <span>Local-first</span>
            <span>·</span>
            <span>Zero cloud</span>
            <span>·</span>
            <span>Acceptance-gated</span>
            <span>·</span>
            <span>MIT License</span>
          </div>
          <div style={{ color: "rgba(229, 170, 122, 0.8)", fontWeight: 500 }}>
            github.com/AkshatNaruka/barkcli
          </div>
        </div>
      </div>
    ),
    size,
  );
}
