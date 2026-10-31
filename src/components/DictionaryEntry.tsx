import { Button, ProgressBar, Spinner } from "@seconddawn/ui";
import { useEffect, useState } from "react";
import { languageName, useT } from "../i18n";
import { ipc, type DictEntry, type DictLookup } from "../ipc";
import type { DictQuery } from "./dictionaryStore";
import { formatBytes } from "./usePacks";

const POS = new Set(["noun", "verb", "adj", "adv", "prep", "postp", "pron", "conj", "intj", "name", "num", "article", "det", "particle", "prefix", "suffix", "phrase", "contraction", "proverb"]);

/** The downloaded size and progress of a pack, and the button that fetches it. */
export function DictionaryDownload({ id, sizeBytes }: { id: string; sizeBytes: number }) {
  const { t } = useT();
  const [state, setState] = useState<{ step: string; done: number; total: number } | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const off = ipc.onDictProgress((p) => {
      if (p.id !== id) return;
      setFailed(p.step === "failed");
      setState(p.step === "done" || p.step === "failed" || p.step === "cancelled" ? null : { step: p.step, done: p.done, total: p.total });
    });
    return () => void off.then((fn) => fn());
  }, [id]);
  if (state) {
    return (
      <div className="dict__download">
        <ProgressBar value={state.done} max={state.total || undefined} label={t("dict.downloading")} />
        <span className="files__hint">{state.step === "downloading" ? t("dict.downloading") : state.step === "verifying" ? t("dict.verifying") : t("dict.extracting")}</span>
        <Button variant="ghost" onClick={() => void ipc.dictCancel(id)}>
          {t("common.cancel")}
        </Button>
      </div>
    );
  }
  return (
    <div className="dict__download">
      <Button variant="primary" icon="download" onClick={() => void ipc.dictInstall(id)}>
        {t("dict.download", { size: formatBytes(sizeBytes) })}
      </Button>
      {failed && <span className="dict__error">{t("dict.failed")}</span>}
    </div>
  );
}

function EntryView({ entry, query, compact }: { entry: DictEntry; query: DictQuery; compact: boolean }) {
  const { t } = useT();
  const senses = compact ? entry.senses.slice(0, 4) : entry.senses;
  return (
    <article className="dict__entry">
      <header className="dict__title">
        <strong className="dict__head">{entry.head}</strong>
        <span className="dict__pos">{POS.has(entry.pos) ? t(`dict.pos.${entry.pos}` as "dict.pos.noun") : entry.pos}</span>
      </header>
      {entry.matched === "form" && <p className="dict__via">{t("dict.formOf", { word: query.word, head: entry.head })}</p>}
      {entry.grammar && <p className="dict__grammar">{entry.grammar}</p>}
      <ol className="dict__senses">
        {senses.map((s, i) => (
          <li key={i}>
            {s.words.length > 0 ? (
              <>
                <span className="dict__words">
                  {s.words.map((w, k) => (
                    <span key={k}>
                      {k > 0 && ", "}
                      <strong>{w.w}</strong>
                      {w.n && <span className="dict__note"> {w.n}</span>}
                    </span>
                  ))}
                </span>
                {s.gloss && <span className="dict__gloss"> {"–"} {s.gloss}</span>}
              </>
            ) : (
              <span>{s.gloss}</span>
            )}
            {s.tags.length > 0 && <span className="dict__tags"> {s.tags.join(", ")}</span>}
          </li>
        ))}
      </ol>
      {!compact && entry.examples.length > 0 && (
        <ul className="dict__examples">
          {entry.examples.map((x, i) => (
            <li key={i}>
              <span>{x.text}</span>
              {x.translation && <span className="dict__gloss"> {"—"} {x.translation}</span>}
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

/**
 * What the dictionary says about a word: its entries (the base form of an inflected word first says so), the closest headwords
 * when there is no entry, or an offer to download the pack for the language pair.
 */
export function DictionaryEntry({ query, compact = false, onLookup }: { query: DictQuery; compact?: boolean; onLookup?: (word: string) => void }) {
  const { t, locale } = useT();
  const [result, setResult] = useState<DictLookup | null>(null);
  const [error, setError] = useState(false);
  const [epoch, setEpoch] = useState(0);
  useEffect(() => {
    const off = ipc.onDictChanged(() => setEpoch((n) => n + 1));
    return () => void off.then((fn) => fn());
  }, []);
  useEffect(() => {
    let stale = false;
    setResult(null);
    setError(false);
    ipc
      .dictLookup(query.word, query.lang, query.partner)
      .then((r) => !stale && setResult(r))
      .catch(() => !stale && setError(true));
    return () => {
      stale = true;
    };
  }, [query.word, query.lang, query.partner, epoch]);

  if (error) return <p className="dict__note">{t("dict.error")}</p>;
  if (!result) {
    return (
      <p className="dict__note">
        <Spinner /> {t("dict.loading")}
      </p>
    );
  }
  if (result.status === "unavailable") return <p className="dict__note">{t("dict.unavailable", { lang: languageName(query.lang, locale) })}</p>;
  if (result.status === "no_pack" && result.pack) {
    return (
      <div className="dict__nopack">
        <p>{t("dict.noPack", { a: languageName(result.pack.languages[0], locale), b: languageName(result.pack.languages[1], locale) })}</p>
        <DictionaryDownload id={result.pack.id} sizeBytes={result.pack.sizeBytes} />
      </div>
    );
  }
  if (result.entries.length === 0) {
    return (
      <div className="dict__none">
        <p>{t("dict.none", { word: query.word })}</p>
        {result.suggestions.length > 0 && (
          <p className="dict__suggest">
            {t("dict.closest")}{" "}
            {result.suggestions.map((s) => (
              <button key={s} type="button" className="dict__chip" onClick={() => onLookup?.(s)}>
                {s}
              </button>
            ))}
          </p>
        )}
      </div>
    );
  }
  const shown = compact ? result.entries.slice(0, 3) : result.entries;
  return (
    <div className="dict">
      {shown.map((e, i) => (
        <EntryView key={`${e.head}-${e.pos}-${i}`} entry={e} query={query} compact={compact} />
      ))}
    </div>
  );
}
