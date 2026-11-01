import React from "react";
import { SelectMenu, type SelectOption } from "./SelectMenu";

function labelOf(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(labelOf).join("");
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) return labelOf(node.props.children);
  return "";
}

function optionsFrom(children: React.ReactNode): SelectOption[] {
  const options: SelectOption[] = [];
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement<{ value?: string | number; disabled?: boolean; children?: React.ReactNode }>(child)) {
      return;
    }
    if (child.type !== "option") return;
    options.push({
      value: String(child.props.value ?? labelOf(child.props.children)),
      label: labelOf(child.props.children),
      disabled: child.props.disabled,
    });
  });
  return options;
}

/**
 * Backwards-compatible quiet select used across the app. It now renders the
 * shared SelectMenu, so every call site gets the same Mac-style menu, keyboard
 * support, outside-click handling, and focus return.
 */
export function QuietSelect({
  className = "",
  chevronClass: _chevronClass,
  children,
  value,
  onChange,
  disabled,
  title,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { chevronClass?: string }) {
  const options = optionsFrom(children);
  const selected = value === undefined ? "" : String(value);
  return (
    <SelectMenu
      id={props.id}
      value={selected}
      options={options}
      ariaLabel={props["aria-label"] || title || "Select"}
      className={className}
      disabled={disabled}
      title={title}
      onChange={(next) =>
        onChange?.({ target: { value: next } } as React.ChangeEvent<HTMLSelectElement>)
      }
    />
  );
}
