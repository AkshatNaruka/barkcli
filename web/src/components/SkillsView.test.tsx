import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SkillsView } from "./SkillsView";

const mockSkills = [
  {
    id: "mvp",
    name: "MVP Slicer",
    description: "Ship smallest useful increment",
    triggers: ["mvp", "intake"],
    source: "builtin",
    enabled: true,
  },
  {
    id: "tdd",
    name: "Test Driven Development",
    description: "Red Green Refactor lifecycle",
    triggers: ["tdd", "test"],
    source: "builtin",
    enabled: true,
  },
];

describe("SkillsView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, "fetch").mockImplementation(async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes("/api/skills/mvp")) {
        return {
          ok: true,
          json: async () => ({
            id: "mvp",
            name: "MVP Slicer",
            description: "Ship smallest useful increment",
            content: "# MVP Slicer instructions",
            triggers: ["mvp", "intake"],
            source: "builtin",
            enabled: true,
          }),
        } as any;
      }
      if (urlStr.includes("/api/skills")) {
        return {
          ok: true,
          json: async () => ({ skills: mockSkills }),
        } as any;
      }
      return { ok: true, json: async () => ({}) } as any;
    });
  });

  it("renders skills list and enables viewing skill details", async () => {
    render(<SkillsView />);

    await waitFor(() => {
      expect(screen.getByText("MVP Slicer")).toBeInTheDocument();
      expect(screen.getByText("Test Driven Development")).toBeInTheDocument();
    });

    const mvpCard = screen.getByText("MVP Slicer");
    await userEvent.click(mvpCard);

    await waitFor(() => {
      expect(screen.getByText(/MVP Slicer instructions/i)).toBeInTheDocument();
    });
  });
});
