import { useSettings } from "@seconddawn/settings";
import { Button, Checkbox, Dialog, Icon, IconButton, Menu, Row, Section, Switch, type MenuEntry } from "@seconddawn/ui";
import { useEffect, useMemo, useRef, useState } from "react";
import { Dropdown } from "../components/Dropdown";
import { usePacks } from "../components/usePacks";
import { languageName, useT } from "../i18n";
import { ipc, type GlossaryEntry, type Glossaries } from "../ipc";
import { settingsStore } from "./store";
import { entriesToAdd, entryValid, filterEntries, groupByPair, newEntry, nextListName } from "./glossaryList";

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
  const [both, setBoth] = useState(false);
  const [message, setMessage] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
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

  const nameOf = (code: string) => languageName(code, locale);
  const languages = (packs.languages.length > 0 ? packs.languages.map((l) => l.code) : ["en", "de"]).map((c) => ({ value: c, label: nameOf(c) }));
  const save = async (next: Glossaries) => {
    setGlossaries(next);
    setGlossaries(await ipc.glossariesSet(next));
  };
  const saveEntries = (entries: GlossaryEntry[]) => save({ lists: glossaries.lists.map((l) => (l.id === selected ? { ...l, entries } : l)) });
  const groups = useMemo(() => groupByPair(filterEntries(list?.entries ?? [], query, nameOf), nameOf), [list?.entries, query, locale]);

  const create = async () => {
    const name = nextListName(glossaries.lists.map((l) => l.name), t("gloss.newName"));
    const next = await ipc.glossariesSet({ lists: [...glossaries.lists, { id: "", name, from: null, to: null, entries: [] }] });
    setGlossaries(next);
    const created = next.lists[next.lists.length - 1];
    setSelected(created.id);
    setRenaming({ id: created.id, name });
  };

  const submit = async () => {
    if (!list || !entryValid(draft)) return;
    const added = entriesToAdd(draft, both);
    const entries = draft.id ? list.entries.map((e) => (e.id === draft.id ? draft : e)) : [...list.entries, ...added];
    await saveEntries(entries);
    setDraft({ ...newEntry(draft.from, draft.to) });
    setBoth(false);
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

  const menu: MenuEntry[] = [
    { label: t("gloss.rename"), icon: "pencil", onSelect: () => list && setRenaming({ id: list.id, name: list.name }) },
    { label: t("gloss.deleteList"), icon: "trash", separator: true, onSelect: () => setDeleting(true) },
  ];

  return (
    <>
      <Section>
        <div className="gloss__head">
          <Dropdown
            value={selected}
            label={t("gloss.lists")}
            placeholder={t("gloss.noLists")}
            options={glossaries.lists.map((l) => ({ value: l.id, label: l.name, hint: t("gloss.count", { count: l.entries.length }) }))}
            onChange={setSelected}
            disabled={glossaries.lists.length === 0}
          />
          {list && <Menu label={t("gloss.menu")} icon="more" entries={menu} open={menuOpen} onOpenChange={setMenuOpen} />}
          <span className="gloss__headspacer" />
          <Button icon="plus" onClick={() => void create()}>
            {t("gloss.new")}
          </Button>
        </div>
        {list && (
          <Row title={t("gloss.enable")} description={t("gloss.enableDesc")}>
            <Switch label={t("gloss.enable")} checked={settings.glossaryActive === list.id} onChange={(on) => void ipc.glossarySetActive(on ? list.id : "")} />
          </Row>
        )}
      </Section>

      {list && (
        <>
          <Section title={draft.id ? t("gloss.edit") : t("gloss.add")}>
            <div className="gloss__add">
              <div className="gloss__term">
                <Dropdown compact value={draft.from} label={t("lang.source")} options={languages} onChange={(c) => setDraft({ ...draft, from: c })} />
                <input value={draft.source} placeholder={t("gloss.source")} aria-label={t("gloss.source")} onChange={(e) => setDraft({ ...draft, source: e.target.value })} />
              </div>
              <span aria-hidden="true">{"→"}</span>
              <div className="gloss__term">
                <Dropdown compact value={draft.to} label={t("lang.target")} options={languages} onChange={(c) => setDraft({ ...draft, to: c })} />
                <input value={draft.target} placeholder={t("gloss.target")} aria-label={t("gloss.target")} onChange={(e) => setDraft({ ...draft, target: e.target.value })} onKeyDown={(e) => e.key === "Enter" && void submit()} />
              </div>
              <IconButton icon="check" label={draft.id ? t("gloss.save") : t("gloss.addButton")} disabled={!entryValid(draft)} onClick={() => void submit()} />
              {draft.id !== 0 && <IconButton icon="close" label={t("common.cancel")} onClick={() => setDraft(newEntry(draft.from, draft.to))} />}
            </div>
            {!draft.id && (
              <Checkbox checked={both} onChange={setBoth}>
                {t("gloss.both")}
              </Checkbox>
            )}
            <details className="gloss__options">
              <summary>{t("gloss.options")}</summary>
              <Checkbox checked={draft.matchCase} onChange={(v) => setDraft({ ...draft, matchCase: v })}>
                {t("gloss.matchCase")}
              </Checkbox>
              <Checkbox checked={draft.wholeWord} onChange={(v) => setDraft({ ...draft, wholeWord: v })}>
                {t("gloss.wholeWord")}
              </Checkbox>
            </details>
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
            {groups.length === 0 && <p className="gloss__note">{list.entries.length === 0 ? t("gloss.empty") : t("gloss.noMatch")}</p>}
            {groups.map((g) => (
              <div key={`${g.from}>${g.to}`} className="gloss__group">
                <h3 className="gloss__pairname">
                  {nameOf(g.from)} <Icon name="chevron" size={12} className="gloss__arrow" /> {nameOf(g.to)}
                </h3>
                <ul className="gloss__list">
                  {g.entries.map((e) => (
                    <li key={e.id} className={e.enabled ? "" : "gloss__off"}>
                      <Switch label={t("gloss.entryOn")} checked={e.enabled} onChange={(v) => void saveEntries(list.entries.map((x) => (x.id === e.id ? { ...x, enabled: v } : x)))} />
                      <span className="gloss__terms">
                        <strong>{e.source}</strong> {"→"} <strong>{e.target}</strong>
                        {(e.matchCase || !e.wholeWord) && (
                          <span className="gloss__pair">
                            {[e.matchCase ? t("gloss.matchCase") : "", e.wholeWord ? "" : t("gloss.partial")].filter(Boolean).join(" · ")}
                          </span>
                        )}
                      </span>
                      <IconButton icon="pencil" label={t("gloss.editButton")} onClick={() => setDraft(e)} />
                      <IconButton icon="trash" label={t("gloss.delete")} onClick={() => void saveEntries(list.entries.filter((x) => x.id !== e.id))} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
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
