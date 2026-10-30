import { useSettings } from "@seconddawn/settings";
import { Button, Checkbox, Dialog, IconButton, Row, Section, Switch } from "@seconddawn/ui";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePacks } from "../components/usePacks";
import { languageName, useT } from "../i18n";
import { ipc, type GlossaryEntry, type Glossaries } from "../ipc";
import { settingsStore } from "./store";
import { filterEntries, newEntry, nextListName } from "./glossaryList";

/**
 * Settings, Glossary: several named glossaries, each a list of terms with the way they must be translated.
 * One of them can be switched on (also from the Text and Files tabs); the engine applies it to every
 * translation. Everything is stored on this computer only.
 */
export function GlossaryPage() {
  const { t, locale } = useT();
  const packs = usePacks();
  const { settings } = useSettings(settingsStore);
  const [glossaries, setGlossaries] = useState<Glossaries>({ lists: [] });
  const [selected, setSelected] = useState("");
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<GlossaryEntry>(() => newEntry("en", settingsStore.getState().targetLanguage));
  const [message, setMessage] = useState("");
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void ipc.glossariesGet().then((g) => {
      setGlossaries(g);
      setSelected((id) => (g.lists.some((l) => l.id === id) ? id : (g.lists.find((l) => l.id === settingsStore.getState().glossaryActive)?.id ?? g.lists[0]?.id ?? "")));
    });
  }, []);

  const list = glossaries.lists.find((l) => l.id === selected);
  useEffect(() => {
    if (!list && glossaries.lists[0]) setSelected(glossaries.lists[0].id);
  }, [list, glossaries.lists]);
  const languages = packs.languages.length > 0 ? packs.languages.map((l) => l.code) : ["en", "de"];
  const nameOf = (code: string) => languageName(code, locale);
  const save = async (next: Glossaries) => {
    setGlossaries(next);
    setGlossaries(await ipc.glossariesSet(next));
  };
  const saveEntries = (entries: GlossaryEntry[]) => save({ lists: glossaries.lists.map((l) => (l.id === selected ? { ...l, entries } : l)) });
  const visible = useMemo(() => filterEntries(list?.entries ?? [], query, nameOf), [list?.entries, query, locale]);

  const create = async () => {
    const name = nextListName(glossaries.lists.map((l) => l.name), t("gloss.newName"));
    const next = await ipc.glossariesSet({ lists: [...glossaries.lists, { id: "", name, from: null, to: null, entries: [] }] });
    setGlossaries(next);
    setSelected(next.lists[next.lists.length - 1].id);
    setRenaming({ id: next.lists[next.lists.length - 1].id, name });
  };

  const submit = async () => {
    if (!list || !draft.source.trim() || !draft.target.trim() || draft.from === draft.to) return;
    const entries = draft.id ? list.entries.map((e) => (e.id === draft.id ? draft : e)) : [...list.entries, draft];
    await saveEntries(entries);
    setDraft(newEntry(draft.from, draft.to));
  };

  const importFile = async (files: FileList | null) => {
    const f = files?.[0];
    if (!f || !list) return;
    const out = await ipc.glossaryImportCsv(list.id, await f.text(), draft.from, draft.to);
    setGlossaries(out.glossaries);
    setMessage(t("gloss.imported", { added: out.added, updated: out.updated, skipped: out.skipped }));
    if (file.current) file.current.value = "";
  };

  const exportFile = async () => {
    if (!list) return;
    const csv = await ipc.glossaryExportCsv(list.id);
    const url = URL.createObjectURL(new Blob(["﻿", csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${list.name.replace(/[\\/:*?"<>|]/g, "_")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <Section title={t("gloss.lists")}>
        <div className="gloss__tools">
          <select value={selected} aria-label={t("gloss.lists")} onChange={(e) => setSelected(e.target.value)} disabled={glossaries.lists.length === 0}>
            {glossaries.lists.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name} ({l.entries.length})
              </option>
            ))}
          </select>
          <Button icon="check" onClick={() => void create()}>
            {t("gloss.new")}
          </Button>
          <Button disabled={!list} onClick={() => list && setRenaming({ id: list.id, name: list.name })}>
            {t("gloss.rename")}
          </Button>
          <Button variant="danger" disabled={!list} onClick={() => setDeleting(true)}>
            {t("gloss.deleteList")}
          </Button>
        </div>
        {list && (
          <Row title={t("gloss.enable")} description={t("gloss.enableDesc")}>
            <Switch
              label={t("gloss.enable")}
              checked={settings.glossaryActive === list.id}
              onChange={(on) => void ipc.glossarySetActive(on ? list.id : "")}
            />
          </Row>
        )}
        {glossaries.lists.length === 0 && <p className="gloss__note">{t("gloss.noLists")}</p>}
      </Section>

      {list && (
        <>
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

          <Section title={t("gloss.list", { count: list.entries.length })}>
            <div className="gloss__tools">
              <input type="search" value={query} placeholder={t("gloss.search")} aria-label={t("gloss.search")} onChange={(e) => setQuery(e.target.value)} />
              <input ref={file} type="file" accept=".csv,text/csv" hidden onChange={(e) => void importFile(e.target.files)} />
              <Button icon="folder" onClick={() => file.current?.click()}>
                {t("gloss.import")}
              </Button>
              <Button icon="download" disabled={list.entries.length === 0} onClick={() => void exportFile()}>
                {t("gloss.export")}
              </Button>
            </div>
            {message && <p className="gloss__note">{message}</p>}
            {visible.length === 0 && <p className="gloss__note">{list.entries.length === 0 ? t("gloss.empty") : t("gloss.noMatch")}</p>}
            <ul className="gloss__list">
              {visible.map((e) => (
                <li key={e.id} className={e.enabled ? "" : "gloss__off"}>
                  <Switch label={t("gloss.entryOn")} checked={e.enabled} onChange={(v) => void saveEntries(list.entries.map((x) => (x.id === e.id ? { ...x, enabled: v } : x)))} />
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
                  <IconButton icon="close" label={t("gloss.delete")} onClick={() => void saveEntries(list.entries.filter((x) => x.id !== e.id))} />
                </li>
              ))}
            </ul>
          </Section>
        </>
      )}

      <Dialog
        open={!!renaming}
        title={t("gloss.rename")}
        onClose={() => setRenaming(null)}
        footer={
          <>
            <Button onClick={() => setRenaming(null)}>{t("common.cancel")}</Button>
            <Button
              variant="primary"
              disabled={!renaming?.name.trim()}
              onClick={() => {
                if (renaming) void save({ lists: glossaries.lists.map((l) => (l.id === renaming.id ? { ...l, name: renaming.name.trim() } : l)) });
                setRenaming(null);
              }}
            >
              {t("gloss.save")}
            </Button>
          </>
        }
      >
        <input className="gloss__rename" autoFocus value={renaming?.name ?? ""} aria-label={t("gloss.name")} onChange={(e) => setRenaming(renaming && { ...renaming, name: e.target.value })} />
      </Dialog>

      <Dialog
        open={deleting}
        title={t("gloss.deleteList")}
        onClose={() => setDeleting(false)}
        footer={
          <>
            <Button onClick={() => setDeleting(false)}>{t("common.cancel")}</Button>
            <Button
              variant="danger"
              onClick={() => {
                void save({ lists: glossaries.lists.filter((l) => l.id !== selected) }).then(() => setSelected(""));
                setDeleting(false);
              }}
            >
              {t("gloss.deleteList")}
            </Button>
          </>
        }
      >
        <p>{t("gloss.deleteConfirm", { name: list?.name ?? "" })}</p>
      </Dialog>
    </>
  );
}
