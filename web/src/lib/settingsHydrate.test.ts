import { beforeEach, describe, expect, it, vi } from "vitest";
import { cacheSettings, loadApiKeySettings, loadGeneralSettings } from "./appSettings";
import { hydrateSettings } from "./settingsHydrate";

const fetchSettings = vi.hoisted(() => vi.fn());

vi.mock("./api", () => ({ fetchSettings }));

describe("hydrateSettings", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("writes the server copy into the synchronous cache", async () => {
    fetchSettings.mockResolvedValue({
      general: { defaultEditor: "cursor", notifications: false, autoSave: true, telemetry: false },
      apiKeys: {
        anthropicKey: "",
        openaiKey: "",
        geminiKey: "",
        openrouterKey: "",
        ollamaEndpoint: "http://127.0.0.1:11434",
        defaultBackend: "claude-code",
        defaultModel: "sonnet",
      },
      terminal: {
        shell: "/bin/zsh",
        fontFamily: "JetBrains Mono",
        fontSize: 13,
        lineHeight: 1.5,
        cursorStyle: "block",
        envVars: [],
      },
      mcpServers: [],
    });

    await hydrateSettings();

    expect(loadGeneralSettings().defaultEditor).toBe("cursor");
    expect(loadApiKeySettings().defaultBackend).toBe("claude-code");
    expect(loadApiKeySettings().defaultModel).toBe("sonnet");
  });

  it("keeps the cached values when the server is unreachable", async () => {
    cacheSettings({
      general: { defaultEditor: "sublime", notifications: true, autoSave: true, telemetry: false },
      apiKeys: {
        anthropicKey: "",
        openaiKey: "",
        geminiKey: "",
        openrouterKey: "",
        ollamaEndpoint: "",
        defaultBackend: "opencode",
        defaultModel: "",
      },
      terminal: {
        shell: "/bin/zsh",
        fontFamily: "JetBrains Mono",
        fontSize: 13,
        lineHeight: 1.5,
        cursorStyle: "block",
        envVars: [],
      },
      mcpServers: [],
    });
    fetchSettings.mockResolvedValue(null);

    await hydrateSettings();

    expect(loadGeneralSettings().defaultEditor).toBe("sublime");
    expect(loadApiKeySettings().defaultBackend).toBe("opencode");
  });
});
