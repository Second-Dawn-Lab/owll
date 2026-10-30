import { useEffect, useMemo, useRef, useState } from "react";
import { useT } from "../i18n";
import { ipc, type Alternative, type SegmentInfo } from "../ipc";
import { placeDropdown } from "./dropdownPlacement";
import { wordsOf, type Word } from "./resultWords";

interface Props {
  text: string;
  segments: SegmentInfo[];
  from: string;
  to: string;
  /** The user picked an alternative for the sentence `segment`: the new text of that sentence. */
  onPick: (segment: number, sentence: string) => void;
  dimmed?: boolean;
}

interface Open {
  word: Word;
  segment: number;
  /** Where the list sits (viewport pixels). */
  x: number;
  y: number;
  items: Alternative[] | null;
  error: boolean;
  selected: number;
  tab: "alternatives" | "dictionary";
}

/**
 * The translation as text whose words can be clicked: a click lists a few other words for that position
 * (the model rewrites the rest of the sentence after the chosen one). Keyboard: Tab to the text, arrows
 * move between words, Enter opens the list, arrows and Enter choose, Esc closes.
 */
export function ResultText({ text, segments, from, to, onPick, dimmed }: Props) {
  const { t } = useT();
  const words = useMemo(() => wordsOf(text), [text]);
  const [open, setOpen] = useState<Open | null>(null);
  const [cursor, setCursor] = useState(-1);
  const listRef = useRef<HTMLUListElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLSpanElement>(null);
  const request = useRef(0);
  const enabled = segments.length > 0;

  useEffect(() => setOpen(null), [text]);

  const segmentOf = (word: Word) => segments.findIndex((s) => word.start >= s.start && word.start < s.end);

  const show = async (index: number, at?: DOMRect) => {
    const word = words[index];
    const seg = segmentOf(word);
    if (!word || seg < 0) return;
    const rect = at ?? rootRef.current?.querySelector<HTMLElement>(`[data-word="${index}"]`)?.getBoundingClientRect();
    const id = ++request.current;
    setCursor(index);
    setOpen({ word, segment: seg, x: rect?.left ?? 0, y: (rect?.bottom ?? 0) + 4, items: null, error: false, selected: 0, tab: "alternatives" });
    try {
      const s = segments[seg];
      const items = await ipc.alternatives(from, to, s.input, s.target, word.start - s.start, word.text);
      // The first item is the current word: start on the next one, there is nothing to choose in the first.
      if (id === request.current) setOpen((o) => (o ? { ...o, items, selected: items.length > 1 ? 1 : 0 } : o));
    } catch {
      if (id === request.current) setOpen((o) => (o ? { ...o, items: [], error: true } : o));
    }
  };

  const choose = (alt: Alternative) => {
    if (!open) return;
    // The current word is listed so the user sees where the sentence stands; choosing it changes nothing.
    if (alt.current) {
      setOpen(null);
      return;
    }
    const s = segments[open.segment];
    ipc.pinTranslation(from, to, s.source, s.input, alt.text);
    onPick(open.segment, alt.text);
    setOpen(null);
  };

  // Keep the open list inside the window.
  useEffect(() => {
    const list = panelRef.current;
    if (!open || !list) return;
    const box = list.getBoundingClientRect();
    const fit = placeDropdown({
      trigger: { left: open.x, right: open.x + 1, top: open.y - 4 - 18, bottom: open.y - 4 },
      viewport: { width: window.innerWidth, height: window.innerHeight },
      width: box.width,
      chromeHeight: 0,
      listHeight: list.scrollHeight,
    });
    list.style.maxHeight = `${Math.max(fit.listMaxHeight, 160)}px`;
    list.style.left = `${Math.max(8, Math.min(open.x, window.innerWidth - box.width - 8))}px`;
    list.style.top = fit.flipUp ? `${Math.max(8, open.y - 4 - 18 - Math.min(list.scrollHeight, fit.listMaxHeight) - 8)}px` : `${open.y}px`;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!panelRef.current?.contains(e.target as Node) && !(e.target as HTMLElement).closest?.("[data-word]")) setOpen(null);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!enabled) return;
    if (open) {
      const n = open.items?.length ?? 0;
      if (e.key === "Escape") {
        setOpen(null);
      } else if (e.key === "ArrowDown" && n) {
        setOpen({ ...open, selected: (open.selected + 1) % n });
      } else if (e.key === "ArrowUp" && n) {
        setOpen({ ...open, selected: (open.selected + n - 1) % n });
      } else if (e.key === "Enter" && open.items?.[open.selected]) {
        choose(open.items[open.selected]);
      } else {
        return;
      }
      e.preventDefault();
      return;
    }
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      const next = Math.max(0, Math.min(words.length - 1, cursor < 0 ? 0 : cursor + (e.key === "ArrowRight" ? 1 : -1)));
      setCursor(next);
      e.preventDefault();
    } else if ((e.key === "Enter" || e.key === " ") && cursor >= 0) {
      void show(cursor);
      e.preventDefault();
    }
  };

  if (!enabled || words.length === 0) return <span className={dimmed ? "pane__stale" : undefined}>{text}</span>;

  const parts: React.ReactNode[] = [];
  let at = 0;
  words.forEach((w, i) => {
    if (w.start > at) parts.push(text.slice(at, w.start));
    const pinned = segments.some((s) => s.pinned && w.start >= s.start && w.start < s.end);
    parts.push(
      <span
        key={i}
        data-word={i}
        className={`word${i === cursor ? " word--cursor" : ""}${pinned ? " word--pinned" : ""}`}
        onClick={(e) => void show(i, e.currentTarget.getBoundingClientRect())}
      >
        {w.text}
      </span>,
    );
    at = w.end;
  });
  if (at < text.length) parts.push(text.slice(at));

  return (
    <span
      ref={rootRef}
      className={dimmed ? "pane__stale" : undefined}
      tabIndex={0}
      role="group"
      aria-label={t("alt.hint")}
      title={t("alt.hint")}
      onKeyDown={onKeyDown}
      onBlur={(e) => {
        if (!panelRef.current?.contains(e.relatedTarget as Node)) setCursor(-1);
      }}
    >
      {parts}
      {open && (
        <div ref={panelRef} className="alts" role="dialog" aria-label={t("alt.title")} style={{ left: open.x, top: open.y }}>
          <div className="alts__head">
            <strong>{t("alt.header", { word: open.word.text })}</strong>
            <button type="button" className="alts__close" aria-label={t("alt.close")} onClick={() => setOpen(null)}>
              {"\u00d7"}
            </button>
          </div>
          <div className="alts__tabs" role="tablist">
            {(["alternatives", "dictionary"] as const).map((tab) => (
              <button key={tab} type="button" role="tab" aria-selected={open.tab === tab} className={`alts__tab${open.tab === tab ? " alts__tab--on" : ""}`} onClick={() => setOpen({ ...open, tab })}>
                {t(tab === "alternatives" ? "alt.tab.alternatives" : "alt.tab.dictionary")}
              </button>
            ))}
          </div>
          {open.tab === "dictionary" ? (
            <p className="alts__note">{t("alt.dictionarySoon")}</p>
          ) : (
            <ul ref={listRef} className="alts__list" role="listbox" aria-label={t("alt.title")}>
              {open.items === null && <li className="alts__note">{t("alt.loading")}</li>}
              {open.items && open.items.length <= 1 && <li className="alts__note">{open.error ? t("alt.error") : t("alt.none")}</li>}
              {open.items?.map((alt, i) => (
                <li key={alt.word + i} role="option" aria-selected={i === open.selected}>
                  <button type="button" className={`alts__item${i === open.selected ? " alts__item--on" : ""}`} onClick={() => choose(alt)} title={alt.text}>
                    <span className="alts__word">
                      {alt.word}
                      {alt.current && <span className="alts__badge">{t("alt.current")}</span>}
                    </span>
                    <span className="alts__preview">{alt.preview}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </span>
  );
}
