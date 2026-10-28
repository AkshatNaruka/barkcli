import { describe, expect, it } from "vitest";
import {
  DEFAULT_APPEARANCE,
  encodeAppearance,
  normalizeAppearance,
  parseAppearance,
  shareUrl,
} from "./theme";
import { SURFACES } from "./surfaces";

describe("appearance serialization", () => {
  it("normalizes a partial appearance and fills every surface exactly once", () => {
    const app = normalizeAppearance({
      theme: "slate",
      railStyle: "labels",
      railOrder: ["history", "history", "board", "not-a-surface"],
      hidden: ["brain"],
    });

    expect(app.theme).toBe("slate");
    expect(app.accent).toBe("sky");
    expect(app.railStyle).toBe("labels");
    expect(app.railOrder[0]).toBe("history");
    expect(app.railOrder[1]).toBe("board");
    expect(new Set(app.railOrder).size).toBe(SURFACES.length);
    expect(app.hidden).toEqual(["brain"]);
  });

  it("repairs invalid values and never hides every surface", () => {
    const app = normalizeAppearance({
      theme: "not-a-theme",
      accent: "not-an-accent",
      railOrder: [],
      hidden: SURFACES.map((surface) => surface.id),
    });

    expect(app.theme).toBe("black");
    expect(app.accent).toBe("copper");
    expect(app.railOrder.map((id) => id).sort()).toEqual(
      DEFAULT_APPEARANCE.railOrder.map((id) => id).sort()
    );
    expect(app.hidden.length).toBeLessThan(SURFACES.length);
  });

  it("round-trips through a shareable preset", () => {
    const app = { ...DEFAULT_APPEARANCE, theme: "neon" as const, accent: "moss" as const };
    expect(parseAppearance(encodeAppearance(app))).toEqual(app);
    expect(parseAppearance(JSON.stringify(app))).toEqual(app);
  });

  it("reads a preset URL and drops tokens from share links", () => {
    const app = { ...DEFAULT_APPEARANCE, theme: "light" as const };
    const encoded = encodeAppearance(app);
    expect(parseAppearance(`https://bark.test/?preset=${encoded}&token=secret`)).toEqual(app);

    const url = shareUrl(app);
    expect(url).toContain("#/chat");
    expect(url).not.toContain("token=");
    expect(url).toContain("preset=");
  });

  it("rejects empty and malformed presets", () => {
    expect(parseAppearance("")).toBeNull();
    expect(parseAppearance("not json or base64")).toBeNull();
  });
});
