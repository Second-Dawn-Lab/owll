import { useSettings } from "@seconddawn/settings";
import { Button, Checkbox, Dialog, Icon, IconButton, Spinner } from "@seconddawn/ui";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { languageName, useT } from "../i18n";
import { ipc, IpcError, type EditOpened, type TranslateResult } from "../ipc";
import { settingsStore } from "../settings/store";
import { headerLabel } from "./editLabels";
import * as model from "./editModel";
import type { EditState, Filter, Row } from "./editModel";
import { ResultText } from "./ResultText";
import { applyPick } from "./resultWords";
import { offsetOf, rowRange } from "./virtualRows";

const ESTIMATE = 120;
const FILTERS: Filter[] = ["all", "edited", "glossary", "kept"];
const SAVE_DELAY_MS = 1200;

/** What the engine made of a segment's sentences, for word alternatives and the glossary highlight; null when the text is not the engine's. */
type Analysis = { text: string; result: TranslateResult } | null;

interface Props {
  draftId: string;
  /** The document when it was moved since the draft was made. */
  path?: string;
  onClose: () => void;
}

const FORMATS = ["fmt-b", "fmt-i", "fmt-u", "fmt-l"];
function formatClass(style: number): string {
  return FORMATS.filter((_, bit) => style & (1 << bit)).join(" ");
}

function Formatted({ text, styles }: { text: string; styles: number[] }) {
  return (
    <>
      {model.pieces(text, styles).map((p, i) => (
        <span key={i} className={p.style ? formatClass(p.style) : undefined}>
          {p.text}
        </span>
      ))}
    </>
  );
}

/**
 * Translate and edit: the original on the left, the translation on the right, one row per paragraph, cell or slide text.
 * Both columns are in the same row, so they scroll together. Only the rows in view are drawn (a 300-page document has
 * thousands). Edits are kept as a draft a moment after each change; nothing is written until "Save as".
 */
export function EditorView({ draftId, path: movedPath, onClose }: Props) {
  const { t, locale } = useT();
  const { settings } = useSettings(settingsStore);
  const [opened, setOpened] = useState<EditOpened | null>(null);
  const [problem, setProblem] = useState<{ code: string; message: string } | null>(null);
  const [state, setState] = useState<EditState | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [keepDraft, setKeepDraft] = useState(false);
  const [saved, setSaved] = useState<{ output: string } | null>(null);
  const [saveError, setSaveError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [retranslating, setRetranslating] = useState<number | null>(null);
  const [busyUnits, setBusyUnits] = useState<Set<number>>(new Set());
  /** The segment the user is working in: only it asks for whole-sentence alternatives. */
  const [active, setActive] = useState<number | null>(null);
  const stateRef = useRef<EditState | null>(null);
  stateRef.current = state;
  const openedRef = useRef<EditOpened | null>(null);
  openedRef.current = opened;

  const load = useCallback(async (path?: string) => {
    setProblem(null);
    try {
      const out = await ipc.editResume(draftId, path);
      setOpened(out);
      setState(model.open(out));
    } catch (e) {
      const err = e as IpcError;
      setProblem({ code: err.code ?? "unknown", message: err.message ?? "" });
    }
  }, [draftId]);

  useEffect(() => {
    void load(movedPath);
  }, [load, movedPath]);

  // Keep the edits as a draft shortly after each change, and once more when leaving.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flush = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = null;
    const o = openedRef.current;
    const s = stateRef.current;
    if (o && s) void ipc.editDraftSave(o.path, model.editsForSave(s)).catch(() => undefined);
  }, []);
  useEffect(() => {
    if (!state || state.past.length + state.future.length === 0) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(flush, SAVE_DELAY_MS);
  }, [state?.edits]);
  useEffect(
    () => () => {
      // Leaving the editor (also when the window changes tab): keep the draft, free the document.
      const o = openedRef.current;
      if (!o) return;
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        const s = stateRef.current;
        if (s) void ipc.editDraftSave(o.path, model.editsForSave(s)).catch(() => undefined);
      }
      void ipc.editClose(o.path, false);
    },
    [],
  );

  // --- the list: only the rows in view -------------------------------------------------------------------
  const visible = useMemo(() => (state ? model.visibleRows(state, filter) : []), [state?.rows, state?.edits, filter]);
  const heights = useRef(new Float64Array(0));
  const [scroll, setScroll] = useState({ top: 0, height: 600 });
  const [, bump] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const observer = useRef<ResizeObserver | null>(null);
  const frame = useRef(0);

  useEffect(() => {
    if (state && heights.current.length !== state.rows.length) heights.current = new Float64Array(state.rows.length);
  }, [state?.rows.length]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const measure = () => setScroll((s) => ({ ...s, height: el.clientHeight }));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    observer.current = new ResizeObserver((entries) => {
      let changed = false;
      for (const entry of entries) {
        const i = Number((entry.target as HTMLElement).dataset.row);
        const h = Math.round((entry.target as HTMLElement).offsetHeight);
        if (!Number.isNaN(i) && heights.current[i] !== h) {
          heights.current[i] = h;
          changed = true;
        }
      }
      if (changed && !frame.current) {
        frame.current = requestAnimationFrame(() => {
          frame.current = 0;
          bump((n) => n + 1);
        });
      }
    });
    return () => {
      ro.disconnect();
      observer.current?.disconnect();
    };
  }, [!!state]);

  const heightList = visible.map((i) => heights.current[i] ?? 0);
  const range = rowRange(heightList, visible.length, ESTIMATE, scroll.top, scroll.height);

  const scrollToRow = (row: number) => {
    const at = visible.indexOf(row);
    if (at < 0 || !listRef.current) return;
    const top = offsetOf(heightList, at, ESTIMATE);
    if (top < scroll.top || top > scroll.top + scroll.height - 80) listRef.current.scrollTop = Math.max(0, top - 40);
  };

  // --- analysis of a segment (sentences of its translation), fetched for the rows in view ------------------
  const analyses = useRef(new Map<number, Analysis>());
  const requested = useRef(new Set<string>());
  const [analysisVersion, setAnalysisVersion] = useState(0);
  const ensureAnalysis = useCallback((unit: number, text: string) => {
    const key = `${unit}\u0000${text}`;
    const known = analyses.current.get(unit);
    if ((known && known.text === text) || requested.current.has(key)) return;
    requested.current.add(key);
    void ipc
      .editAnalyse(unit, text)
      .then((result) => {
        analyses.current.set(unit, result ? { text, result } : null);
        setAnalysisVersion((v) => v + 1);
      })
      .catch(() => undefined)
      .finally(() => requested.current.delete(key));
  }, []);

  // --- changes ---------------------------------------------------------------------------------------------
  const commit = useCallback((unit: number, text: string) => setState((s) => (s ? model.setText(s, unit, text) : s)), []);

  const pick = useCallback((unit: number, segment: number, sentence: string) => {
    const s = stateRef.current;
    const known = analyses.current.get(unit);
    if (!s || !known) return;
    const out = applyPick(known.result.text, known.result.segments, segment, sentence, known.result.glossaryTerms);
    analyses.current.set(unit, { text: out.text, result: { ...known.result, text: out.text, segments: out.segments, glossaryTerms: out.terms, glossaryHits: out.terms.length } });
    setState((cur) => (cur ? model.setText(cur, unit, out.text) : cur));
  }, []);

  const retranslate = async (unit: number) => {
    setBusyUnits((b) => new Set(b).add(unit));
    try {
      const out = await ipc.editRetranslate(unit);
      analyses.current.delete(unit);
      setState((s) => (s ? model.retranslated(s, unit, out.text, out.hits) : s));
    } catch {
      /* the text stays as it was */
    } finally {
      setBusyUnits((b) => {
        const n = new Set(b);
        n.delete(unit);
        return n;
      });
    }
  };

  const doUndo = () =>
    setState((s) => {
      if (!s) return s;
      const out = model.undo(s);
      if (out.unit !== null) setTimeout(() => scrollToRow(s.rowOf[out.unit as number]), 0);
      return out.state;
    });
  const doRedo = () =>
    setState((s) => {
      if (!s) return s;
      const out = model.redo(s);
      if (out.unit !== null) setTimeout(() => scrollToRow(s.rowOf[out.unit as number]), 0);
      return out.state;
    });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "TEXTAREA" || target.tagName === "INPUT")) return;
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key === "z" && !e.shiftKey) {
        e.preventDefault();
        doUndo();
      } else if (key === "y" || (key === "z" && e.shiftKey)) {
        e.preventDefault();
        doRedo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible]);

  // --- saving and discarding ---------------------------------------------------------------------------------
  const saveAs = async () => {
    if (!opened || !state) return;
    setSaving(true);
    setSaveError(false);
    try {
      let output = await ipc.docDefaultOutput(opened.path, opened.to, null);
      if (settings.downloadLocation === "ask") {
        const { save } = await import("@tauri-apps/plugin-dialog");
        const chosen = await save({ defaultPath: output, filters: [{ name: opened.name, extensions: [output.split(".").pop() ?? "docx"] }] });
        if (!chosen) return;
        output = chosen;
      }
      const result = await ipc.editSave(opened.path, output, model.editsForSave(state), keepDraft);
      setSaved({ output: result.output });
    } catch {
      setSaveError(true);
    } finally {
      setSaving(false);
    }
  };

  const discard = async () => {
    if (opened) await ipc.editClose(opened.path, true);
    else await ipc.draftDelete(draftId);
    openedRef.current = null;
    onClose();
  };

  const pickFile = async () => {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const picked = await open({ multiple: false });
    if (typeof picked === "string") void load(picked);
  };

  // --- views -------------------------------------------------------------------------------------------------
  if (problem) {
    const name = movedPath?.split(/[\\/]/).pop() ?? "";
    const text = problem.code === "draft_gone" ? t("ed.draftGone") : problem.code === "draft_missing" ? t("ed.draftMissing", { name: problem.message.split(/[\\/]/).pop() ?? name }) : problem.code === "draft_changed" ? t("ed.draftChanged", { name: problem.message.split(/[\\/]/).pop() ?? name }) : problem.message;
    return (
      <div className="ed ed--problem">
        <Icon name="alert" size={28} />
        <p>{text}</p>
        <div className="ed__problemactions">
          {(problem.code === "draft_missing" || problem.code === "draft_changed") && (
            <Button icon="folder" onClick={() => void pickFile()}>
              {t("ed.draftPick")}
            </Button>
          )}
          <Button
            variant="ghost"
            onClick={() => {
              void ipc.draftDelete(draftId).finally(onClose);
            }}
          >
            {t("ed.draftDiscard")}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            {t("ed.back")}
          </Button>
        </div>
      </div>
    );
  }
  if (!opened || !state) {
    return (
      <div className="ed ed--problem">
        <Spinner />
        <p>{t("ed.loading")}</p>
      </div>
    );
  }

  const counts = model.filterCounts(state);
  const sliceRows = visible.slice(range.start, range.end);

  return (
    <div className="ed">
      <div className="ed__bar">
        <Button variant="ghost" onClick={onClose}>
          {"←"} {t("ed.back")}
        </Button>
        <strong className="ed__name" title={opened.path}>
          {opened.name}
        </strong>
        <span className="files__hint">
          {languageName(opened.from, locale)} {"→"} {languageName(opened.to, locale)}
        </span>
        <span className="topbar__spacer" />
        <IconButton icon="undo" label={t("ed.undo")} disabled={!model.canUndo(state)} onClick={doUndo} />
        <IconButton icon="redo" label={t("ed.redo")} disabled={!model.canRedo(state)} onClick={doRedo} />
        <Checkbox checked={keepDraft} onChange={setKeepDraft}>
          {t("ed.keepDraft")}
        </Checkbox>
        <Button variant="ghost" onClick={() => setDiscarding(true)}>
          {t("ed.discard")}
        </Button>
        <Button variant="primary" icon="download" disabled={saving} onClick={() => void saveAs()}>
          {t("ed.saveAs")}
        </Button>
      </div>

      <div className="ed__filters" role="group" aria-label={t("ed.filterLabel")}>
        {FILTERS.map((f) => (
          <button key={f} type="button" className={`ed__filter${filter === f ? " ed__filter--on" : ""}`} aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {t(`ed.filter.${f}` as "ed.filter.all")} <span>{counts[f]}</span>
          </button>
        ))}
      </div>

      {saved && (
        <div className="ed__banner" role="status">
          <Icon name="check" size={16} /> {t("ed.saved", { name: saved.output.split(/[\\/]/).pop() ?? saved.output })}
          <Button variant="ghost" onClick={() => void ipc.docOpen(saved.output)}>
            {t("files.open")}
          </Button>
          <Button variant="ghost" onClick={() => void ipc.docShowInFolder(saved.output)}>
            {t("files.show")}
          </Button>
          <IconButton icon="close" label={t("common.close")} onClick={() => setSaved(null)} />
        </div>
      )}
      {saveError && (
        <div className="ed__banner ed__banner--error" role="alert">
          <Icon name="alert" size={16} /> {t("ed.saveFailed")}
        </div>
      )}

      <div className="ed__colhead">
        <span>{languageName(opened.from, locale)} · {t("ed.colSource")}</span>
        <span>{languageName(opened.to, locale)} · {t("ed.colTarget")}</span>
      </div>

      <div className="ed__list" ref={listRef} onScroll={(e) => setScroll((s) => ({ ...s, top: (e.target as HTMLElement).scrollTop }))}>
        {visible.length === 0 && <p className="ed__empty">{t("ed.empty")}</p>}
        <div style={{ height: range.before }} aria-hidden="true" />
        {sliceRows.map((rowIndex) => {
          const row = state.rows[rowIndex];
          return (
            <EditorRow
              key={rowIndex}
              index={rowIndex}
              row={row}
              text={row.unit === null ? null : model.textOf(state, row.unit)}
              edited={row.unit !== null && model.isEdited(state, row.unit)}
              analysis={row.unit === null ? null : (analyses.current.get(row.unit) ?? null)}
              analysisVersion={analysisVersion}
              busy={row.unit !== null && busyUnits.has(row.unit)}
              active={row.unit !== null && row.unit === active}
              onActivate={setActive}
              from={opened.from}
              to={opened.to}
              observer={observer}
              onCommit={commit}
              onPick={pick}
              onRetranslate={(unit) => (model.isEdited(state, unit) ? setRetranslating(unit) : void retranslate(unit))}
              ensureAnalysis={ensureAnalysis}
            />
          );
        })}
        <div style={{ height: range.after }} aria-hidden="true" />
      </div>

      <Dialog
        open={discarding}
        title={t("ed.discardTitle")}
        onClose={() => setDiscarding(false)}
        footer={
          <>
            <Button onClick={() => setDiscarding(false)}>{t("common.cancel")}</Button>
            <Button variant="danger" onClick={() => void discard()}>
              {t("ed.discardConfirm")}
            </Button>
          </>
        }
      >
        <p>{t("ed.discardBody", { name: opened.name })}</p>
      </Dialog>

      <Dialog
        open={retranslating !== null}
        title={t("ed.retranslateTitle")}
        onClose={() => setRetranslating(null)}
        footer={
          <>
            <Button onClick={() => setRetranslating(null)}>{t("common.cancel")}</Button>
            <Button
              variant="primary"
              onClick={() => {
                const unit = retranslating;
                setRetranslating(null);
                if (unit !== null) void retranslate(unit);
              }}
            >
              {t("ed.retranslate")}
            </Button>
          </>
        }
      >
        <p>{t("ed.retranslateBody")}</p>
      </Dialog>
    </div>
  );
}

interface RowProps {
  index: number;
  row: Row;
  text: string | null;
  edited: boolean;
  analysis: Analysis;
  analysisVersion: number;
  busy: boolean;
  active: boolean;
  onActivate: (unit: number) => void;
  from: string;
  to: string;
  observer: React.MutableRefObject<ResizeObserver | null>;
  onCommit: (unit: number, text: string) => void;
  onPick: (unit: number, segment: number, sentence: string) => void;
  onRetranslate: (unit: number) => void;
  ensureAnalysis: (unit: number, text: string) => void;
}

/** One paragraph, cell or slide text: its place, the original, and the translation (editable). */
const EditorRow = memo(function EditorRow({ index, row, text, edited, analysis, busy, active, onActivate, from, to, observer, onCommit, onPick, onRetranslate, ensureAnalysis }: RowProps) {
  const { t } = useT();
  const ref = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const area = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    const o = observer.current;
    if (!el || !o) return;
    o.observe(el);
    return () => o.unobserve(el);
  }, [observer]);

  // A plain segment shows its sentences clickable once the engine's analysis has arrived.
  useEffect(() => {
    if (row.unit !== null && row.plain && text !== null && !editing) ensureAnalysis(row.unit, text);
  }, [row.unit, row.plain, text, editing]);

  useEffect(() => {
    const el = area.current;
    if (!editing || !el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [editing, draft]);

  const label = headerLabel(row.header);
  const kept = row.unit === null;
  const unit = row.unit;
  const broken = editing && row.styles.length > 1 && !model.markersIntact(draft, row.styles.length);
  const startEdit = () => {
    if (kept || text === null) return;
    setDraft(text);
    setEditing(true);
    setTimeout(() => area.current?.focus(), 0);
  };
  const finish = (save: boolean) => {
    setEditing(false);
    if (save && unit !== null) onCommit(unit, draft);
  };

  const usable = analysis && text !== null && analysis.text === text ? analysis.result : null;

  return (
    <div ref={ref} data-row={index} onMouseDownCapture={() => unit !== null && onActivate(unit)} onFocusCapture={() => unit !== null && onActivate(unit)} className={`ed__row${kept ? " ed__row--kept" : ""}${edited ? " ed__row--edited" : ""}`}>
      <div className="ed__head">
        <span>{t(label.key as "ed.h.body", label.values)}</span>
        {edited && <span className="ed__mark">{t("ed.editedMark")}</span>}
        {row.hits > 0 && <span className="ed__mark ed__mark--gloss">{t("ed.glossaryMark")}</span>}
        {kept && <span className="ed__mark ed__mark--kept">{t("ed.kept")}</span>}
        {!kept && (
          <span className="ed__tools">
            <IconButton icon="pencil" label={t("ed.edit")} onClick={startEdit} />
            <IconButton icon="replace" label={t("ed.retranslate")} disabled={busy} onClick={() => unit !== null && onRetranslate(unit)} />
          </span>
        )}
      </div>
      <div className="ed__cols">
        <div className="ed__cell ed__src" dir="auto">
          <Formatted text={row.source} styles={row.styles} />
        </div>
        <div className="ed__cell ed__tgt" dir="auto">
          {kept ? (
            <span className="ed__keptText">
              <Formatted text={row.source} styles={[]} />
            </span>
          ) : editing ? (
            <>
              <textarea
                ref={area}
                className="ed__input"
                value={draft}
                rows={1}
                aria-label={t("ed.edit")}
                onChange={(e) => setDraft(e.target.value.replace(/[\r\n]+/g, " "))}
                onBlur={() => finish(true)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    e.preventDefault();
                    finish(false);
                  } else if (e.key === "Enter") {
                    e.preventDefault();
                    finish(true);
                  }
                }}
              />
              {broken && <p className="ed__warn">{t("ed.markersBroken")}</p>}
            </>
          ) : usable && text !== null ? (
            <ResultText
              text={usable.text}
              segments={usable.segments}
              terms={usable.glossaryTerms}
              from={from}
              to={to}
              onPick={(segment, sentence) => unit !== null && onPick(unit, segment, sentence)}
              sentenceAlternatives={active}
            />
          ) : (
            <span className={busy ? "pane__stale" : undefined} onDoubleClick={startEdit}>
              <Formatted text={text ?? ""} styles={row.styles} />
            </span>
          )}
        </div>
      </div>
    </div>
  );
});
