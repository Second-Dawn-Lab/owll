import { Icon } from "@seconddawn/ui";
import { useT } from "../i18n";
import { DictionaryEntry } from "./DictionaryEntry";
import { setPanelOpen, showWord, useDictionaryState } from "./dictionaryStore";

/** A collapsible panel under the panes with the last word looked up, so a long entry does not squeeze into the popup. */
export function DictionaryPanel() {
  const { t } = useT();
  const { query, open } = useDictionaryState();
  return (
    <section className={`dictpanel${open ? " dictpanel--open" : ""}`} aria-label={t("dict.title")}>
      <button type="button" className="dictpanel__head" aria-expanded={open} onClick={() => setPanelOpen(!open)}>
        <Icon name="chevron" size={14} className="dictpanel__chevron" />
        <strong>{t("dict.title")}</strong>
        {query && <span className="dictpanel__word">{query.word}</span>}
      </button>
      {open && (
        <div className="dictpanel__body">{query ? <DictionaryEntry query={query} onLookup={(word) => showWord({ ...query, word }, true)} /> : <p className="dict__note">{t("dict.hint")}</p>}</div>
      )}
    </section>
  );
}
