import { Icon, Popover } from "@seconddawn/ui";
import { useEffect, useRef, useState } from "react";

export interface DropdownOption<T extends string> {
  value: T;
  label: string;
  /** A second, muted line (for example a language pair). */
  hint?: string;
  /** Shown as a separator above (the "Manage..." entry). */
  separated?: boolean;
}

/**
 * Owl-L's own dropdown (not the browser's `<select>`): a button with the chosen label and a list that opens
 * below it. Keyboard: Enter or Space opens, Up/Down move, Enter chooses, Esc closes.
 */
export function Dropdown<T extends string>({
  value,
  options,
  onChange,
  label,
  compact,
  placeholder,
  align = "start",
  disabled,
}: {
  value: T;
  options: DropdownOption<T>[];
  onChange: (value: T) => void;
  label: string;
  compact?: boolean;
  placeholder?: string;
  align?: "start" | "end" | "center";
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const current = options.find((o) => o.value === value);

  useEffect(() => {
    if (open) setCursor(Math.max(0, options.findIndex((o) => o.value === value)));
  }, [open]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${cursor}"]`)?.scrollIntoView({ block: "nearest" });
  }, [cursor, open]);

  const choose = (o: DropdownOption<T>) => {
    setOpen(false);
    onChange(o.value);
  };

  return (
    <Popover
      open={open}
      onClose={() => setOpen(false)}
      align={align}
      trigger={
        <button
          type="button"
          className={`dropdown${compact ? " dropdown--compact" : ""}`}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={label}
          disabled={disabled}
          onClick={() => setOpen((o) => !o)}
          onKeyDown={(e) => {
            if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
              setOpen(true);
              e.preventDefault();
            } else if (open && e.key === "ArrowDown") {
              setCursor((c) => Math.min(options.length - 1, c + 1));
              e.preventDefault();
            } else if (open && e.key === "ArrowUp") {
              setCursor((c) => Math.max(0, c - 1));
              e.preventDefault();
            } else if (open && e.key === "Enter" && options[cursor]) {
              choose(options[cursor]);
              e.preventDefault();
            }
          }}
        >
          <span className="dropdown__label">{current?.label ?? placeholder ?? ""}</span>
          <Icon name="chevron" size={14} />
        </button>
      }
    >
      <ul ref={listRef} className="dropdown__list" role="listbox" aria-label={label}>
        {options.map((o, i) => (
          <li key={o.value} role="option" aria-selected={o.value === value} className={o.separated ? "dropdown__sep" : undefined}>
            <button type="button" data-index={i} className={`dropdown__item${i === cursor ? " dropdown__item--on" : ""}`} onClick={() => choose(o)}>
              <span className="dropdown__check">{o.value === value && <Icon name="check" size={14} />}</span>
              <span className="dropdown__text">
                {o.label}
                {o.hint && <span className="dropdown__hint">{o.hint}</span>}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Popover>
  );
}
