import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icon";

export interface SelectOption {
  value: string;
  label: string;
  hint?: string;
  disabled?: boolean;
}

interface SelectMenuProps {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  ariaLabel: string;
  id?: string;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  title?: string;
}

/**
 * Mac-style select: a proper menu with outside-click/Escape close, keyboard
 * navigation, focus return, viewport clamping, and a selected checkmark.
 */
export function SelectMenu({
  value,
  options,
  onChange,
  ariaLabel,
  id,
  className = "",
  placeholder = "Select…",
  disabled = false,
  title,
}: SelectMenuProps) {
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [position, setPosition] = useState({ left: 0, top: 0, width: 220, maxHeight: 300 });
  const [placement, setPlacement] = useState(0);

  const selected = useMemo(
    () => options.find((option) => option.value === value),
    [options, value]
  );

  useLayoutEffect(() => {
    if (!open || !trigger.current) return;
    const rect = trigger.current.getBoundingClientRect();
    // Inside a composer, every menu rises from the same line — the card's top
    // edge — the way the model panel does, instead of floating in the thread.
    const anchorTop =
      trigger.current.closest(".thread-composer")?.getBoundingClientRect().top ?? rect.top;
    const width = Math.min(360, Math.max(rect.width, 200));
    const gap = 8;
    const gutter = 8;
    const spaceBelow = window.innerHeight - rect.bottom - gutter - gap;
    const spaceAbove = anchorTop - gutter - gap;
    const left = Math.min(
      Math.max(gutter, rect.left),
      Math.max(gutter, window.innerWidth - width - gutter)
    );
    // Measure the menu itself: a three-item list should sit snug on its
    // anchor, not float a fixed 320px away from it.
    const measured = menu.current?.scrollHeight ?? 0;
    const natural = (measured > 0 ? Math.min(measured, 320) : 320) + 2; // + border
    const below = natural <= spaceBelow || spaceBelow >= spaceAbove;
    const maxHeight = Math.max(140, Math.min(320, below ? spaceBelow : spaceAbove));
    const top = below
      ? rect.bottom + gap
      : Math.max(gutter, anchorTop - Math.min(natural, maxHeight) - gap);
    setPosition((prev) =>
      prev.left === left && prev.top === top && prev.width === width && prev.maxHeight === maxHeight
        ? prev
        : { left, top, width, maxHeight }
    );
    const index = Math.max(0, options.findIndex((option) => option.value === value));
    setActive((prev) => (prev === index ? prev : index));
  }, [open, options, value, placement]);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (menu.current?.contains(target) || trigger.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
        trigger.current?.focus();
      }
    };
    const onScroll = () => {
      // Keep the menu attached to its trigger instead of vanishing the moment
      // the dialog behind it scrolls.
      setPlacement((value) => value + 1);
    };
    document.addEventListener("pointerdown", onPointer, true);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", onScroll);
    window.addEventListener("scroll", onScroll, true);
    menu.current?.focus();
    return () => {
      document.removeEventListener("pointerdown", onPointer, true);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("resize", onScroll);
      window.removeEventListener("scroll", onScroll, true);
      if (previous?.isConnected) previous.focus();
    };
  }, [open]);

  const choose = (next: SelectOption) => {
    if (next.disabled) return;
    onChange(next.value);
    setOpen(false);
    trigger.current?.focus();
  };

  const move = (direction: number) => {
    if (!options.length) return;
    let index = active;
    for (let step = 0; step < options.length; step += 1) {
      index = (index + direction + options.length) % options.length;
      if (!options[index].disabled) {
        setActive(index);
        return;
      }
    }
  };

  const onMenuKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      move(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      move(-1);
    } else if (event.key === "Home") {
      event.preventDefault();
      setActive(options.findIndex((option) => !option.disabled));
    } else if (event.key === "End") {
      event.preventDefault();
      for (let index = options.length - 1; index >= 0; index -= 1) {
        if (!options[index].disabled) {
          setActive(index);
          break;
        }
      }
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const option = options[active];
      if (option) choose(option);
    } else if (event.key === "Tab") {
      setOpen(false);
    }
  };

  return (
    <>
      <button
        ref={trigger}
        id={id}
        type="button"
        className={`select-menu-trigger ${className}`}
        role="combobox"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? "select-menu-listbox" : undefined}
        disabled={disabled}
        title={title}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <span>{selected?.label || placeholder}</span>
        <Icon name="chevR" size={12} className="select-menu-chev" />
      </button>

      {open &&
        createPortal(
          <div
            ref={menu}
            id="select-menu-listbox"
            className="select-menu-popover"
            role="listbox"
            aria-label={ariaLabel}
            tabIndex={-1}
            style={{
              left: position.left,
              top: position.top,
              width: position.width,
              maxHeight: position.maxHeight,
            }}
            onKeyDown={onMenuKey}
          >
            {options.length === 0 ? (
              <p className="select-menu-empty">No options</p>
            ) : (
              options.map((option, index) => (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={option.value === value}
                  disabled={option.disabled}
                  className={`select-menu-option ${
                    index === active ? "is-active" : ""
                  } ${option.value === value ? "is-selected" : ""}`}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => choose(option)}
                >
                  <span>
                    <strong>{option.label}</strong>
                    {option.hint && <small>{option.hint}</small>}
                  </span>
                  {option.value === value && <Icon name="check" size={13} />}
                </button>
              ))
            )}
          </div>,
          document.body
        )}
    </>
  );
}
