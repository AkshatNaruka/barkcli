import { afterEach, describe, expect, it, vi } from "vitest";
import { readLocal, writeLocal } from "./drafts";

describe("native draft restoration", () => {
  afterEach(() => {
    delete (window as any).__BARK_THREAD_PREFERENCES__;
    delete (window as any).__TAURI__;
  });

  it("reads a project-scoped draft even on a fresh local origin", () => {
    const key = "bark:draft:v1:/project:dev:new";
    (window as any).__BARK_THREAD_PREFERENCES__ = { [key]: "Restore my prompt" };
    expect(readLocal(key)).toBe("Restore my prompt");
    expect(readLocal("bark:draft:v1:/other:dev:new")).toBeNull();
  });

  it("persists prompt edits and clearing without copying unrelated storage", async () => {
    const invoke = vi.fn().mockResolvedValue(undefined);
    (window as any).__TAURI__ = { core: { invoke } };
    const key = "bark:draft:v1:/project:dev:new";
    writeLocal(key, "Prompt");
    writeLocal(key, null);
    writeLocal("auth-token", "never copied");
    await vi.waitFor(() => expect(invoke).toHaveBeenCalledTimes(2));
    expect(invoke).toHaveBeenNthCalledWith(1, "thread_preference_set", { key, value: "Prompt" });
    expect(invoke).toHaveBeenNthCalledWith(2, "thread_preference_set", { key, value: null });
    expect(readLocal(key)).toBeNull();
  });
});
