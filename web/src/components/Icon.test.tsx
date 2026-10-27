import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { Icon } from "./Icon";

describe("Icon", () => {
  it("renders the plus glyph used by New intent", () => {
    const { container } = render(<Icon name="plus" />);
    expect(container.querySelectorAll("path")).toHaveLength(1);
    expect(container.querySelector("path")?.getAttribute("d")).toBe("M12 5v14M5 12h14");
  });

  it("renders the stop glyph", () => {
    const { container } = render(<Icon name="stop" />);
    expect(container.querySelectorAll("rect")).toHaveLength(1);
  });
});
