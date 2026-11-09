import { describe, expect, it } from "vitest";
import {
  isLocalhostUrl,
  normalizeBrowserUrl,
  toInbuiltBrowserUrl,
} from "./inbuiltBrowser";

describe("inbuiltBrowser", () => {
  it("normalizes URLs correctly", () => {
    expect(normalizeBrowserUrl("localhost:3000")).toBe("http://localhost:3000");
    expect(normalizeBrowserUrl("127.0.0.1:5173/test")).toBe("http://127.0.0.1:5173/test");
    expect(normalizeBrowserUrl("github.com/org/repo")).toBe("https://github.com/org/repo");
    expect(normalizeBrowserUrl("https://example.com")).toBe("https://example.com");
  });

  it("identifies localhost URLs", () => {
    expect(isLocalhostUrl("http://localhost:5173")).toBe(true);
    expect(isLocalhostUrl("http://127.0.0.1:8080")).toBe(true);
    expect(isLocalhostUrl("http://0.0.0.0:3000")).toBe(true);
    expect(isLocalhostUrl("https://github.com")).toBe(false);
    expect(isLocalhostUrl("https://google.com")).toBe(false);
  });

  it("routes external URLs through proxy and localhost directly", () => {
    expect(toInbuiltBrowserUrl("http://localhost:5173")).toBe("http://localhost:5173");
    expect(toInbuiltBrowserUrl("http://127.0.0.1:3000/app")).toBe("http://127.0.0.1:3000/app");
    expect(toInbuiltBrowserUrl("https://github.com/org/repo")).toBe(
      "/api/proxy?url=https%3A%2F%2Fgithub.com%2Forg%2Frepo"
    );
    expect(toInbuiltBrowserUrl("google.com")).toBe(
      "/api/proxy?url=https%3A%2F%2Fgoogle.com"
    );
  });
});
