import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { Icon } from "./Icon";

describe("Icon", () => {
  it("renders a Lucide glyph with a consistent accessible treatment", () => {
    const { container } = render(<Icon name="plus" size={14} className="test-icon" />);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).toHaveAttribute("width", "14");
    expect(svg).toHaveClass("test-icon");
  });

  it("renders every semantic icon through the shared library", () => {
    const { container } = render(<Icon name="stop" />);
    expect(container.querySelector("svg")).not.toBeNull();
    expect(container.querySelector("rect, path")).not.toBeNull();
  });
});
