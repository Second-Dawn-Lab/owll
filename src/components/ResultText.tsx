import { useEffect, useMemo, useRef, useState } from "react";
import { useT } from "../i18n";
import { ipc, type Alternative, type GlossaryTerm, type SegmentInfo } from "../ipc";
import { altsSize, previewRest } from "./altsLayout";
import { termAt, wordsOf, type Word } from "./resultWords";

interface Props {
  text: string;
  segments: SegmentInfo[];
  /** Glossary terms in the text: highlighted, with a tooltip; a click shows the entry. */
  terms?: GlossaryTerm[];
  from: string;
  to: string;
  /** The user picked an alternative for the sentence `segment`: the new text of that sentence. */
  onPick: (segment: number, sentence: string) => void;
  dimmed?: boolean;
  /** Show up to three whole-sentence alternatives under the text (the Text tab). */
  sentenceAlternatives?: boolean;
}

type Panel =
  | { kind: "words"; word: Word; segment: number; x: number; y: number; items: Alternative[] | null; error: boolean; selected: number; tab: "alternatives" | "dictionary" }
  | { kind: "term"; term: GlossaryTerm; x: number; y: number };

/**
 * The translation as text whose words can be clicked: a click lists a few other words for that position (the
 * model rewrites the rest of the sentence after the chosen one); a glossary term shows its entry instead.
 * Keyboard: Tab to the text, arrows move between words, Enter opens, arrows and Enter choose, Esc closes.
 */
export function ResultText({ text, segments, terms = [], from, to, onPick, dimmed, sentenceAlternatives }: Props) {
  const { t } = useT();
  const words = useMemo(() => wordsOf(text), [text]);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [cursor, setCursor] = useState(-1);
  /** The sentence the last click or cursor was in: the one the sentence alternatives belong to. */
  const [active, setActive] = useState<number | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const rootRef = useRef<HTMLSpanElement>(null);
  const request = useRef(0);
  const enabled = segments.length > 0;

  useEffect(() => setPanel(null), [text]);
  useEffect(() => setActive(null), [segments.length]);

  const segmentOf = (word: Word) => segments.findIndex((s) => word.start >= s.start && word.start < s.end);

  const show = async (index: number, at?: DOMRect) => {
    const word = words[index];
    const seg = segmentOf(word);
    if (!word || seg < 0) return;
    const rect = at ?? rootRef.current?.querySelector<HTMLElement>(`[data-word="${index}"]`)?.getBoundingClientRect();
    const x = rect?.left ?? 0;
    const y = (rect?.bottom ?? 0) + 4;
    setCursor(index);
    setActive(seg);
    const term = termAt(terms, word);
    if (term) {
      setPanel({ kind: "term", term, x, y });
      return;
    }
    const id = ++request.current;
    setPanel({ kind: "words", word, segment: seg, x, y, items: null, error: false, selected: 0, tab: "alternatives" });
    try {
      const s = segments[seg];
      const items = await ipc.alternatives(from, to, s.input, s.target, word.start - s.start, word.text);
      // The first item is the current word: start on the next one, there is nothing to choose in the first.
      if (id === request.current) setPanel((p) => (p && p.kind === "words" ? { ...p, items, selected: items.length > 1 ? 1 : 0 } : p));
    } catch {
      if (id === request.current) setPanel((p) => (p && p.kind === "words" ? { ...p, items: [], error: true } : p));
    }
  };

  const choose = (alt: Alternative) => {
    if (!panel || panel.kind !== "words") return;
    // The current word is listed so the user sees where the sentence stands; choosing it changes nothing.
    if (alt.current) {
      setPanel(null);
      return;
    }
    const s = segments[panel.segment];
    ipc.pinTranslation(from, to, s.source, s.input, alt.text);
    onPick(panel.segment, alt.text);
    setPanel(null);
  };

  // Keep the panel on screen: sized to its items (up to eight rows), below the word or above it when there is more room.
  useEffect(() => {
    const el = panelRef.current;
    if (!panel || !el) return;
    const chrome = panel.kind === "words" ? 96 : 0;
    const below = window.innerHeight - panel.y - chrome - 12;
    const above = panel.y - 28 - chrome - 12;
    const flip = panel.kind === "words" && below < 3 * 32 && above > below;
    if (panel.kind === "words" && listRef.current) {
      const size = altsSize(panel.items?.length ?? 1, flip ? above : below);
      listRef.current.style.height = `${size.height}px`;
    }
    const box = el.getBoundingClientRect();
    el.style.left = `${Math.max(8, Math.min(panel.x, window.innerWidth - box.width - 8))}px`;
    el.style.top = flip ? `${Math.max(8, panel.y - 28 - box.height)}px` : `${panel.y}px`;
  }, [panel]);

  useEffect(() => {
    if (!panel) return;
    const close = (e: MouseEvent) => {
      if (!panelRef.current?.contains(e.target as Node) && !(e.target as HTMLElement).closest?.("[data-word]")) setPanel(null);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [panel]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!enabled) return;
    if (panel?.kind === "words") {
      const n = panel.items?.length ?? 0;
      if (e.key === "Escape") {
        setPanel(null);
      } else if (e.key === "ArrowDown" && n) {
        setPanel({ ...panel, selected: (panel.selected + 1) % n });
      } else if (e.key === "ArrowUp" && n) {
        setPanel({ ...panel, selected: (panel.selected + n - 1) % n });
      } else if (e.key === "Enter" && panel.items?.[panel.selected]) {
        choose(panel.items[panel.selected]);
      } else {
        return;
      }
      e.preventDefault();
      return;
    }
    if (panel?.kind === "term" && e.key === "Escape") {
      setPanel(null);
      e.preventDefault();
      return;
    }
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      const next = Math.max(0, Math.min(words.length - 1, cursor < 0 ? 0 : cursor + (e.key === "ArrowRight" ? 1 : -1)));
      setCursor(next);
      const seg = segmentOf(words[next]);
      if (seg >= 0) setActive(seg);
      e.preventDefault();
    } else if ((e.key === "Enter" || e.key === " ") && cursor >= 0) {
      void show(cursor);
      e.preventDefault();
    }
  };

  // Whole-sentence alternatives for the sentence of the cursor or click (a single sentence is always the one).
  const activeSegment = active ?? (segments.length === 1 ? 0 : null);
  const [sentences, setSentences] = useState<string[]>([]);
  useEffect(() => {
    setSentences([]);
    if (!sentenceAlternatives || activeSegment === null || !segments[activeSegment]) return;
    const s = segments[activeSegment];
    let stale = false;
    const timer = setTimeout(() => {
      void ipc
        .sentenceAlternatives(from, to, s.input, s.target)
        .then((list) => !stale && setSentences(list))
        .catch(() => undefined);
    }, 350);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [sentenceAlternatives, activeSegment, segments, from, to]);

  const pickSentence = (sentence: string) => {
    if (activeSegment === null) return;
    const s = segments[activeSegment];
    ipc.pinTranslation(from, to, s.source, s.input, sentence);
    onPick(activeSegment, sentence);
  };

  if (!enabled || words.length === 0) return <span className={dimmed ? "pane__stale" : undefined}>{text}</span>;

  const parts: React.ReactNode[] = [];
  let at = 0;
  words.forEach((w, i) => {
    if (w.start > at) parts.push(text.slice(at, w.start));
    const pinned = segments.some((s) => s.pinned && w.start >= s.start && w.start < s.end);
    const term = termAt(terms, w);
    parts.push(
      <span
        key={i}
        data-word={i}
        className={`word${i === cursor ? " word--cursor" : ""}${pinned ? " word--pinned" : ""}${term ? " word--term" : ""}`}
        title={term ? t("gloss.tip", { source: term.source, target: term.target }) : undefined}
        onClick={(e) => void show(i, e.currentTarget.getBoundingClientRect())}
      >
        {w.text}
      </span>,
    );
    at = w.end;
  });
  if (at < text.length) parts.push(text.slice(at));

  return (
    <>
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
        {panel?.kind === "term" && (
          <div ref={panelRef} className="alts alts--term" role="dialog" aria-label={t("gloss.entryTitle")} style={{ left: panel.x, top: panel.y }}>
            <div className="alts__head">
              <strong>{t("gloss.entryTitle")}</strong>
              <button type="button" className="alts__close" aria-label={t("alt.close")} onClick={() => setPanel(null)}>
                {"×"}
              </button>
            </div>
            <p className="alts__note">{t("gloss.tip", { source: panel.term.source, target: panel.term.target })}</p>
            <button
              type="button"
              className="alts__link"
              onClick={() => {
                setPanel(null);
                void ipc.openSettings("glossary");
              }}
            >
              {t("gloss.editInGlossary")}
            </button>
          </div>
        )}
        {panel?.kind === "words" && (
          <div ref={panelRef} className="alts" role="dialog" aria-label={t("alt.title")} style={{ left: panel.x, top: panel.y }}>
            <div className="alts__head">
              <strong>{t("alt.header", { word: panel.word.text })}</strong>
              <button type="button" className="alts__close" aria-label={t("alt.close")} onClick={() => setPanel(null)}>
                {"×"}
              </button>
            </div>
            <div className="alts__tabs" role="tablist">
              {(["alternatives", "dictionary"] as const).map((tab) => (
                <button key={tab} type="button" role="tab" aria-selected={panel.tab === tab} className={`alts__tab${panel.tab === tab ? " alts__tab--on" : ""}`} onClick={() => setPanel({ ...panel, tab })}>
                  {t(tab === "alternatives" ? "alt.tab.alternatives" : "alt.tab.dictionary")}
                </button>
              ))}
            </div>
            {panel.tab === "dictionary" ? (
              <p className="alts__note">{t("alt.dictionarySoon")}</p>
            ) : (
              <ul ref={listRef} className="alts__list" role="listbox" aria-label={t("alt.title")}>
                {panel.items === null && <li className="alts__note">{t("alt.loading")}</li>}
                {panel.items && panel.items.length <= 1 && <li className="alts__note">{panel.error ? t("alt.error") : t("alt.none")}</li>}
                {panel.items?.map((alt, i) => (
                  <li key={alt.word + i} role="option" aria-selected={i === panel.selected}>
                    <button type="button" className={`alts__item${i === panel.selected ? " alts__item--on" : ""}`} onClick={() => choose(alt)} title={alt.text}>
                      <span className="alts__word">{alt.word}</span>
                      {alt.current ? <span className="alts__badge">{t("alt.current")}</span> : <span className="alts__preview">{previewRest(alt.word, alt.preview)}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </span>
      {sentenceAlternatives && sentences.length > 0 && (
        <div className="sentalts">
          <div className="sentalts__title">{t("alt.sentences")}</div>
          {sentences.map((s) => (
            <button key={s} type="button" className="sentalts__item" onClick={() => pickSentence(s)}>
              {s}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
