import { describe, expect, it, vi } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CodeBlock, extractText } from "./CodeBlock";

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

  it("detects language when children is an array of nodes (e.g. from markdown AST)", () => {
    render(
      <CodeBlock>
        {[
          <code key="code-1" className="hljs language-c++">
            std::cout &lt;&lt; 0;
          </code>,
        ]}
      </CodeBlock>
    );

    expect(screen.getByText("C++")).toBeInTheDocument();
  });

  it("extracts text correctly preserving numeric zero in nested spans", () => {
    const element = (
      <code>
        <span>const</span> <span>count</span> = <span>{0}</span>;
      </code>
    );
    expect(extractText(element)).toBe("const count = 0;");
  });

  it("toggles word-wrap between pre and pre-wrap", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <CodeBlock>
        <code className="language-json">{"{\"status\": 200, \"long\": \"data\"}"}</code>
      </CodeBlock>
    );

    const wrapBtn = screen.getByRole("button", { name: "Wrap lines" });
    expect(wrapBtn).toBeInTheDocument();
    expect(wrapBtn).toHaveAttribute("aria-pressed", "false");

    const pre = container.querySelector("pre");
    expect(pre).toHaveClass("whitespace-pre");

    await user.click(wrapBtn);
    expect(wrapBtn).toHaveAttribute("aria-label", "Disable line wrap");
    expect(wrapBtn).toHaveAttribute("aria-pressed", "true");
    expect(pre).toHaveClass("whitespace-pre-wrap");
  });

  it("provides a Run button for shell code blocks that notifies onRun callback", async () => {
    const user = userEvent.setup();
    const onRun = vi.fn();

    render(
      <CodeBlock onRun={onRun}>
        <code className="language-bash">cargo test --workspace</code>
      </CodeBlock>
    );

    expect(screen.getByText("BASH")).toBeInTheDocument();
    const runBtn = screen.getByRole("button", { name: "Run command in composer" });
    expect(runBtn).toBeInTheDocument();

    await user.click(runBtn);
    expect(onRun).toHaveBeenCalledWith("cargo test --workspace");
    expect(await screen.findByText("Staged")).toBeInTheDocument();
  });
});
