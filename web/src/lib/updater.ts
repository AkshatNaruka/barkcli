export type UpdateChannel = "stable" | "beta" | "nightly";

export interface ReleaseAsset {
  name: string;
  size: number;
  downloadUrl: string;
  platform: "macos" | "windows" | "linux" | "other";
}

export interface ReleaseInfo {
  version: string;
  tag: string;
  name: string;
  publishedAt: string;
  body: string;
  htmlUrl: string;
  assets: ReleaseAsset[];
  prerelease: boolean;
}

export interface UpdatePreferences {
  channel: UpdateChannel;
  autoCheck: boolean;
  autoDownload: boolean;
  lastChecked?: number;
}

export const CURRENT_VERSION = "0.4.22";
const UPDATER_STORAGE_KEY = "barkcli-updater-prefs-v1";

export const DEFAULT_UPDATE_PREFS: UpdatePreferences = {
  channel: "stable",
  autoCheck: true,
  autoDownload: false,
};

export function loadUpdatePreferences(): UpdatePreferences {
  if (typeof window === "undefined") return DEFAULT_UPDATE_PREFS;
  try {
    const raw = localStorage.getItem(UPDATER_STORAGE_KEY);
    if (!raw) return DEFAULT_UPDATE_PREFS;
    return { ...DEFAULT_UPDATE_PREFS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_UPDATE_PREFS;
  }
}

export function saveUpdatePreferences(prefs: UpdatePreferences): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(UPDATER_STORAGE_KEY, JSON.stringify(prefs));
  } catch {}
}

function parseSemver(v: string): [number, number, number] {
  const clean = v.replace(/^v/, "").trim();
  const parts = clean.split("-")[0].split(".").map((n) => parseInt(n, 10) || 0);
  return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
}

export function compareSemver(current: string, incoming: string): number {
  const [cMaj, cMin, cPat] = parseSemver(current);
  const [iMaj, iMin, iPat] = parseSemver(incoming);

  if (iMaj !== cMaj) return iMaj - cMaj;
  if (iMin !== cMin) return iMin - cMin;
  return iPat - cPat;
}

export async function fetchReleases(channel: UpdateChannel = "stable"): Promise<ReleaseInfo | null> {
  try {
    const res = await fetch("https://api.github.com/repos/AkshatNaruka/barkcli/releases", {
      headers: {
        Accept: "application/vnd.github.v3+json",
      },
    });

    if (!res.ok) {
      // No fabricated fallback: an offline or rate-limited check must look
      // like one instead of inventing a release with dead download links.
      return null;
    }

    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) {
      return null;
    }

    const matching = data.find((r: any) => {
      if (channel === "stable") return !r.prerelease && !r.draft;
      if (channel === "beta") return !r.draft;
      return true;
    }) || data[0];

    const assets: ReleaseAsset[] = (matching.assets || []).map((a: any) => {
      const name = a.name || "";
      let platform: ReleaseAsset["platform"] = "other";
      if (name.includes("apple") || name.includes("darwin") || name.endsWith(".dmg") || name.includes("macos")) {
        platform = "macos";
      } else if (name.endsWith(".exe") || name.endsWith(".msi") || name.includes("windows")) {
        platform = "windows";
      } else if (name.endsWith(".tar.gz") || name.endsWith(".deb") || name.endsWith(".AppImage") || name.includes("linux")) {
        platform = "linux";
      }
      return {
        name,
        size: a.size || 0,
        downloadUrl: a.browser_download_url || matching.html_url,
        platform,
      };
    });

    return {
      version: matching.tag_name?.replace(/^v/, "") || matching.name || CURRENT_VERSION,
      tag: matching.tag_name || `v${CURRENT_VERSION}`,
      name: matching.name || matching.tag_name || `Bark Release`,
      publishedAt: matching.published_at || new Date().toISOString(),
      body: matching.body || "Performance enhancements, updated MCP integration, and UI fixes.",
      htmlUrl: matching.html_url || "https://github.com/AkshatNaruka/barkcli/releases",
      assets,
      prerelease: Boolean(matching.prerelease),
    };
  } catch {
    return null;
  }
}
