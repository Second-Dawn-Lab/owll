import { Icon } from "@seconddawn/ui";
import { useEffect, useMemo, useRef, useState } from "react";
import { ipc } from "../ipc";
import { filterRows, moveCursor, startCursor, type PickerSpec } from "./pickerModel";

/**
 * The page of the list window (`picker`): the rows the asking window described, an optional search field, keyboard control
 * (arrows, Enter, Esc). A click elsewhere closes the window from the backend.
 */
export function PickerPage() {
  const [spec, setSpec] = useState<PickerSpec | null>(null);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(-1);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const load = () =>
      void ipc.pickerSpec().then((s) => {
        setSpec(s);
        setQuery("");
        setCursor(s ? startCursor(s.items) : -1);
      });
    load();
    const off = ipc.onPickerSpec(load);
    return () => void off.then((fn) => fn());
  }, []);

  const rows = useMemo(() => (spec ? filterRows(spec.items, query) : []), [spec, query]);
  useEffect(() => setCursor(startCursor(rows)), [query]);
  useEffect(() => {
    listRef.current?.querySelector(".picker__item--on")?.scrollIntoView({ block: "nearest" });
  }, [cursor, spec]);
  // Without a search field the window itself takes the keys (the arrows and Esc work on the list).
  useEffect(() => {
    if (spec && !spec.search) document.body.tabIndex = -1;
    if (spec && !spec.search) document.body.focus();
  }, [spec]);

  const choose = (value?: string) => value !== undefined && void ipc.pickerChoose(value);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      void ipc.pickerClose();
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => moveCursor(rows, c, e.key === "ArrowDown" ? 1 : -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(rows[cursor]?.value);
    }
  };

  if (!spec) return null;
  return (
    <div className="pickerwin" onKeyDown={onKeyDown} role="listbox">
      {spec.search && (
        <div className="picker__search">
          <Icon name="search" size={15} />
          <input autoFocus value={query} placeholder={spec.searchPlaceholder} aria-label={spec.searchPlaceholder} onChange={(e) => setQuery(e.target.value)} />
        </div>
      )}
      <div className="picker__list pickerwin__list" ref={listRef}>
        {rows.map((row, i) =>
          row.kind === "group" ? (
            <div key={`g${i}`} className="picker__group">
              {row.label}
            </div>
          ) : (
            <button key={`${row.value}${i}`} type="button" role="option" aria-selected={row.checked} className={`picker__item${i === cursor ? " picker__item--on" : ""}`} onMouseMove={() => setCursor(i)} onClick={() => choose(row.value)}>
              <span className="picker__check">{row.checked && <Icon name="check" size={15} />}</span>
              <span className="picker__name">{row.label}</span>
              {row.tag && <span className="picker__beta">{row.tag}</span>}
              {row.badge && (
                <span className="picker__badge">
                  <Icon name="download" size={12} />
                  {row.badge}
                </span>
              )}
            </button>
          ),
        )}
        {rows.length === 0 && <div className="picker__none">{spec.emptyText}</div>}
      </div>
    </div>
  );
}
