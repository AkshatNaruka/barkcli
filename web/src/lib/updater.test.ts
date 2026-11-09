import { describe, expect, it } from "vitest";
import {
  CURRENT_VERSION,
  compareSemver,
  fetchReleases,
  loadUpdatePreferences,
  saveUpdatePreferences,
  type UpdatePreferences,
} from "./updater";

describe("updater utilities", () => {
  it("correctly compares semver versions", () => {
    expect(compareSemver("0.4.21", "0.4.22")).toBeGreaterThan(0); // incoming is newer
    expect(compareSemver("0.4.21", "0.4.21")).toBe(0); // same
    expect(compareSemver("0.4.22", "0.4.21")).toBeLessThan(0); // incoming is older
    expect(compareSemver("0.4.21", "0.5.0")).toBeGreaterThan(0);
    expect(compareSemver("0.4.21", "1.0.0")).toBeGreaterThan(0);
  });

  it("fetches release info with fallback resilience", async () => {
    const release = await fetchReleases("stable");
    expect(release).not.toBeNull();
    expect(release?.version).toBeDefined();
    expect(release?.assets).toBeDefined();
    expect(Array.isArray(release?.assets)).toBe(true);
  });

  it("saves and loads update preferences", () => {
    const custom: UpdatePreferences = {
      channel: "beta",
      autoCheck: false,
      autoDownload: true,
      lastChecked: 1234567890,
    };
    saveUpdatePreferences(custom);
    expect(loadUpdatePreferences()).toEqual(custom);

    // Reset back
    saveUpdatePreferences({ channel: "stable", autoCheck: true, autoDownload: false });
  });
});
