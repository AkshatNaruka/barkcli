import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SelectMenu } from "./SelectMenu";
import { QuietSelect } from "./QuietSelect";

describe("SelectMenu", () => {
  it("opens, selects, and returns focus", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <SelectMenu
        ariaLabel="Board"
        value="dev"
        onChange={onChange}
        options={[
          { value: "dev", label: "dev.board" },
          { value: "phase4", label: "phase4.board" },
        ]}
      />
    );

    const trigger = screen.getByRole("combobox", { name: "Board" });
    await user.click(trigger);
    expect(screen.getByRole("listbox", { name: "Board" })).toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: "phase4.board" }));

    expect(onChange).toHaveBeenCalledWith("phase4");
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("closes on Escape and outside click", async () => {
    const user = userEvent.setup();
    render(
      <SelectMenu
        ariaLabel="Priority"
        value="low"
        onChange={vi.fn()}
        options={[{ value: "low", label: "Low" }]}
      />
    );
    const trigger = screen.getByRole("combobox", { name: "Priority" });
    await user.click(trigger);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

    await user.click(trigger);
    await user.click(document.body);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("supports arrow-key navigation", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <SelectMenu
        ariaLabel="Role"
        value="builder"
        onChange={onChange}
        options={[
          { value: "builder", label: "Builder" },
          { value: "reviewer", label: "Reviewer" },
        ]}
      />
    );
    await user.click(screen.getByRole("combobox", { name: "Role" }));
    await user.keyboard("{ArrowDown}{Enter}");
    expect(onChange).toHaveBeenCalledWith("reviewer");
  });
});

describe("QuietSelect", () => {
  it("adapts native option children to the shared menu", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <QuietSelect value="a" onChange={onChange} aria-label="Choice">
        <option value="a">Alpha</option>
        <option value="b">Beta</option>
      </QuietSelect>
    );

    await user.click(screen.getByRole("combobox", { name: "Choice" }));
    await user.click(screen.getByRole("option", { name: "Beta" }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ target: { value: "b" } }));
  });
});
