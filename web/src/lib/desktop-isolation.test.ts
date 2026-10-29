import { describe, expect, it, vi } from "vitest";

vi.mock("./desktop", () => ({ isDesktop: () => true }));

import { isDemoMode } from "./demo";
import { isReplayMode } from "./replay";

describe("desktop isolation", () => {
  it("never enables demo or replay mode inside Bark.app", () => {
    window.history.replaceState({}, "", "/?demo=1&run=replay&replay=1");
    localStorage.setItem("barkcli-demo", "1");

    expect(isDemoMode()).toBe(false);
    expect(isReplayMode()).toBe(false);

    localStorage.removeItem("barkcli-demo");
    window.history.replaceState({}, "", "/");
  });
});
