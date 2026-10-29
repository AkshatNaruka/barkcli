import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QuickOpen } from "./QuickOpen";

const api = vi.hoisted(() => ({
  fetchRepoTree: vi.fn(),
  fetchRepoFile: vi.fn(),
  openInEditor: vi.fn(),
}));
vi.mock("../lib/api", () => api);

describe("QuickOpen", () => {
  it("searches the real tree, previews a file, and asks Bark", async () => {
    api.fetchRepoTree.mockResolvedValue({
      root: "/tmp/project",
      entries: [
        { path: "src/App.tsx", name: "App.tsx", kind: "file" },
        { path: "src/auth.ts", name: "auth.ts", kind: "file" },
      ],
    });
    api.fetchRepoFile.mockResolvedValue({
      path: "src/auth.ts",
      content: "export function requireAuth() {}\n",
      bytes: 36,
      truncated: false,
      binary: false,
    });
    const onAskBark = vi.fn();
    const user = userEvent.setup();

    render(<QuickOpen open onClose={vi.fn()} onAskBark={onAskBark} />);

    await waitFor(() => expect(screen.getByText("src/auth.ts")).toBeTruthy());
    await user.click(screen.getByText("src/auth.ts"));
    expect(await screen.findByText(/export function requireAuth/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Ask Bark" }));
    expect(onAskBark).toHaveBeenCalledWith("src/auth.ts");
  });
});
