import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProjectAvatar } from "./ProjectAvatar";

describe("ProjectAvatar", () => {
  it("renders custom initials for known projects", () => {
    const { rerender } = render(<ProjectAvatar name="barkcli" />);
    expect(screen.getByText("BI")).toBeInTheDocument();

    rerender(<ProjectAvatar name="ses" />);
    expect(screen.getByText("SS")).toBeInTheDocument();
  });

  it("renders loop icon for skilluply", () => {
    render(<ProjectAvatar name="skilluply" />);
    expect(screen.getByLabelText("skilluply")).toBeInTheDocument();
  });

  it("renders dashed scratch indicator for No project", () => {
    render(<ProjectAvatar name="No project" />);
    expect(screen.getByLabelText("No project (scratch)")).toBeInTheDocument();
  });

  it("generates 2-letter uppercase initials for arbitrary project names", () => {
    render(<ProjectAvatar name="my-awesome-tool" />);
    expect(screen.getByText("MA")).toBeInTheDocument();
  });
});
