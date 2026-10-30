import { Button, Checkbox, IconButton, Row, Section, Switch } from "@seconddawn/ui";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePacks } from "../components/usePacks";
import { languageName, useT } from "../i18n";
import { ipc, type Glossary, type GlossaryEntry } from "../ipc";
import { settingsStore } from "./store";
import { filterEntries, newEntry } from "./glossaryList";

/**
 * Settings, Glossary: terms that must be translated in a given way, per language pair. The engine
 * applies them to every translation; the list is stored on this computer only.
 */
export function GlossaryPage() {
  const { t, locale } = useT();
  const packs = usePacks();
  const [glossary, setGlossary] = useState<Glossary>({ enabled: true, entries: [] });
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<GlossaryEntry>(() => newEntry("en", settingsStore.getState().targetLanguage));
  const [message, setMessage] = useState("");
  const file = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void ipc.glossaryGet().then(setGlossary);
  }, []);

  const languages = packs.languages.length > 0 ? packs.languages.map((l) => l.code) : ["en", "de"];
  const nameOf = (code: string) => languageName(code, locale);
  const save = async (next: Glossary) => {
    setGlossary(next);
    setGlossary(await ipc.glossarySet(next));
  };
  const visible = useMemo(() => filterEntries(glossary.entries, query, nameOf), [glossary.entries, query, locale]);

  const submit = async () => {
    if (!draft.source.trim() || !draft.target.trim() || draft.from === draft.to) return;
    const entries = draft.id ? glossary.entries.map((e) => (e.id === draft.id ? draft : e)) : [...glossary.entries, draft];
    await save({ ...glossary, entries });
    setDraft(newEntry(draft.from, draft.to));
  };

  const importFile = async (files: FileList | null) => {
    const f = files?.[0];
    if (!f) return;
    const out = await ipc.glossaryImportCsv(await f.text(), draft.from, draft.to);
    setGlossary(out.glossary);
    setMessage(t("gloss.imported", { added: out.added, updated: out.updated, skipped: out.skipped }));
    if (file.current) file.current.value = "";
  };

  const exportFile = async () => {
    const csv = await ipc.glossaryExportCsv();
    const url = URL.createObjectURL(new Blob(["﻿", csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "owl-l-glossary.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <Section title={t("gloss.section")}>
        <Row title={t("gloss.enable")} description={t("gloss.enableDesc")}>
          <Switch label={t("gloss.enable")} checked={glossary.enabled} onChange={(v) => void save({ ...glossary, enabled: v })} />
        </Row>
      </Section>

      <Section title={draft.id ? t("gloss.edit") : t("gloss.add")}>
        <div className="gloss__form">
          <label>
            {t("gloss.source")}
            <input value={draft.source} onChange={(e) => setDraft({ ...draft, source: e.target.value })} />
          </label>
          <label>
            {t("gloss.target")}
            <input value={draft.target} onChange={(e) => setDraft({ ...draft, target: e.target.value })} />
          </label>
          <label>
            {t("lang.source")}
            <select value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })}>
              {languages.map((c) => (
                <option key={c} value={c}>
                  {nameOf(c)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("lang.target")}
            <select value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })}>
              {languages.map((c) => (
                <option key={c} value={c}>
                  {nameOf(c)}
                </option>
              ))}
            </select>
          </label>
          <Checkbox checked={draft.matchCase} onChange={(v) => setDraft({ ...draft, matchCase: v })}>
            {t("gloss.matchCase")}
          </Checkbox>
          <Checkbox checked={draft.wholeWord} onChange={(v) => setDraft({ ...draft, wholeWord: v })}>
            {t("gloss.wholeWord")}
          </Checkbox>
          <div className="gloss__buttons">
            <Button variant="primary" disabled={!draft.source.trim() || !draft.target.trim() || draft.from === draft.to} onClick={() => void submit()}>
              {draft.id ? t("gloss.save") : t("gloss.addButton")}
            </Button>
            {draft.id !== 0 && (
              <Button variant="ghost" onClick={() => setDraft(newEntry(draft.from, draft.to))}>
                {t("common.cancel")}
              </Button>
            )}
          </div>
        </div>
        <p className="gloss__note">{t("gloss.limit")}</p>
      </Section>

      <Section title={t("gloss.list", { count: glossary.entries.length })}>
        <div className="gloss__tools">
          <input type="search" value={query} placeholder={t("gloss.search")} aria-label={t("gloss.search")} onChange={(e) => setQuery(e.target.value)} />
          <input ref={file} type="file" accept=".csv,text/csv" hidden onChange={(e) => void importFile(e.target.files)} />
          <Button icon="folder" onClick={() => file.current?.click()}>
            {t("gloss.import")}
          </Button>
          <Button icon="download" disabled={glossary.entries.length === 0} onClick={() => void exportFile()}>
            {t("gloss.export")}
          </Button>
        </div>
        {message && <p className="gloss__note">{message}</p>}
        {visible.length === 0 && <p className="gloss__note">{glossary.entries.length === 0 ? t("gloss.empty") : t("gloss.noMatch")}</p>}
        <ul className="gloss__list">
          {visible.map((e) => (
            <li key={e.id} className={e.enabled ? "" : "gloss__off"}>
              <Switch label={t("gloss.entryOn")} checked={e.enabled} onChange={(v) => void save({ ...glossary, entries: glossary.entries.map((x) => (x.id === e.id ? { ...x, enabled: v } : x)) })} />
              <span className="gloss__terms">
                <strong>{e.source}</strong> → <strong>{e.target}</strong>
                <span className="gloss__pair">
                  {nameOf(e.from)} → {nameOf(e.to)}
                  {e.matchCase ? ` · ${t("gloss.matchCase")}` : ""}
                  {e.wholeWord ? "" : ` · ${t("gloss.partial")}`}
                </span>
              </span>
              <Button variant="ghost" onClick={() => setDraft(e)}>
                {t("gloss.editButton")}
              </Button>
              <IconButton icon="close" label={t("gloss.delete")} onClick={() => void save({ ...glossary, entries: glossary.entries.filter((x) => x.id !== e.id) })} />
            </li>
          ))}
        </ul>
      </Section>
    </>
  );
}
