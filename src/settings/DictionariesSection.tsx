import { Button, Chip, Section } from "@seconddawn/ui";
import { useCallback, useEffect, useState } from "react";
import { DictionaryDownload } from "../components/DictionaryEntry";
import { formatBytes } from "../components/usePacks";
import { languageName, useT } from "../i18n";
import { ipc, type DictInfo } from "../ipc";

/** Dictionary packs: one per language pair, both directions inside. Offline once downloaded; the data is Wiktionary's (CC BY-SA). */
export function DictionariesSection() {
  const { t, locale } = useT();
  const [packs, setPacks] = useState<DictInfo[]>([]);
  const load = useCallback(() => void ipc.dictList().then(setPacks).catch(() => setPacks([])), []);
  useEffect(() => {
    load();
    const off = ipc.onDictChanged(load);
    return () => void off.then((fn) => fn());
  }, [load]);
  if (packs.length === 0) return null;
  return (
    <Section title={t("packs.dict.title")} description={t("packs.dict.body")}>
      {packs.map((p) => (
        <div key={p.id} className="dw-row">
          <div className="dw-row__text">
            <div className="dw-row__title">
              {p.languages.map((l) => languageName(l, locale)).join(" ↔ ")}
              {p.beta && <Chip tone="warn">{t("packs.dict.beta")}</Chip>}
            </div>
            <div className="dw-row__desc">
              {p.installed ? t("packs.dict.installed", { size: formatBytes(p.sizeBytes) }) : t("packs.dict.size", { size: formatBytes(p.sizeBytes) })}
              {p.entries > 0 && ` · ${t("packs.dict.entries", { count: p.entries.toLocaleString(locale) })}`}
            </div>
            <div className="dw-row__desc">{t("packs.dict.credit", { license: p.license.replace(/-/g, " ").replace("CC BY SA", "CC BY-SA"), source: p.attribution })}</div>
          </div>
          {p.installed ? (
            <Button variant="ghost" onClick={() => void ipc.dictRemove(p.id)}>
              {t("packs.dict.remove")}
            </Button>
          ) : (
            <DictionaryDownload id={p.id} sizeBytes={p.sizeBytes} />
          )}
        </div>
      ))}
      <div className="dw-row">
        <span className="dw-row__desc">{t("packs.dict.links")}</span>
      </div>
    </Section>
  );
}
