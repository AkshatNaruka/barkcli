import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CodeBlock } from "./CodeBlock";

describe("CodeBlock", () => {
  it("renders code with language header and copy button", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    render(
      <CodeBlock>
        <code className="language-typescript">const message: string = "hello world";</code>
      </CodeBlock>
    );

    expect(screen.getByText("TYPESCRIPT")).toBeInTheDocument();
    expect(screen.getByText('const message: string = "hello world";')).toBeInTheDocument();

    const copyBtn = screen.getByRole("button", { name: "Copy code" });
    expect(copyBtn).toBeInTheDocument();

    await user.click(copyBtn);
    expect(writeText).toHaveBeenCalledWith('const message: string = "hello world";');
    expect(await screen.findByText("Copied")).toBeInTheDocument();
  });

  it("handles untagged code blocks gracefully", () => {
    render(
      <CodeBlock>
        <code>plain text code</code>
      </CodeBlock>
    );

    expect(screen.getByText("CODE")).toBeInTheDocument();
    expect(screen.getByText("plain text code")).toBeInTheDocument();
  });
});
