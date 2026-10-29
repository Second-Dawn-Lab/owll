import { Button, Chip, Dialog, ProgressBar, Section, Switch } from "@seconddawn/ui";
import { useEffect, useState } from "react";
import { packErrorText } from "../components/packText";
import { formatBytes, usePacks } from "../components/usePacks";
import { languageName, sortLanguages, useT } from "../i18n";
import { ipc, type LanguageInfo } from "../ipc";

/** Models nobody needs any more after a language was hidden: offered for deletion. */
interface DeleteOffer {
  language: LanguageInfo;
  modelIds: string[];
  freedBytes: number;
}

function OcrSection() {
  const { t } = useT();
  const [tags, setTags] = useState<string[]>([]);
  useEffect(() => {
    void ipc.ocrStatus().then((s) => setTags(s.windowsTags));
  }, []);
  return (
    <Section title={t("packs.ocr.title")} description={t("packs.ocr.body")}>
      <div className="dw-row">
        <div className="dw-row__text">
          <div className="dw-row__title">{t("packs.ocr.windows")}</div>
          <div className="dw-row__desc">{tags.length ? tags.join(", ") : t("packs.ocr.none")}</div>
          <div className="row-extra">
            <Button onClick={() => void ipc.openWindowsLanguageSettings()}>{t("ocr.install")}</Button>
            <p className="note">{t("packs.ocr.rapid")}</p>
          </div>
        </div>
      </div>
    </Section>
  );
}

export function PacksPage() {
  const { t, locale } = useT();
  const packs = usePacks();
  const [deleteOffer, setDeleteOffer] = useState<DeleteOffer | null>(null);
  const nameOf = (l: LanguageInfo) => languageName(l.code, locale, l.name);
  const nameOfCode = (code: string) => {
    const l = packs.languages.find((x) => x.code === code);
    return l ? nameOf(l) : languageName(code, locale);
  };

  /** Activating is instant. Hiding keeps the files; if nobody else uses them, offer to delete. */
  const toggle = async (l: LanguageInfo, on: boolean) => {
    if (on) {
      await ipc.activateLanguage(l.code);
      return;
    }
    const result = await ipc.deactivateLanguage(l.code);
    if (result.modelIds.length > 0) setDeleteOffer({ language: l, ...result });
  };

  const row = (l: LanguageInfo) => {
    const p = packs.progress[l.code];
    const busy = packs.isBusy(l.code);
    const failed = p?.phase === "error";
    const percent = p?.total ? Math.round((p.done / p.total) * 100) : 0;
    const phaseText =
      p?.phase === "verifying"
        ? t("pack.verifying")
        : p?.phase === "extracting"
          ? t("pack.installing")
          : t("pack.downloading", { percent });
    const licenses = [...new Set(l.models.map((m) => m.license))].join(", ");
    const attribution = l.models[0]?.attribution;
    const available = !l.builtIn && l.available && !busy;
    // Files that no active language uses (shown so they can be deleted).
    const unused = available && !l.installed && !l.includedWith.some((c) => packs.languages.find((x) => x.code === c)?.installed);
    const includedWith = l.includedWith[0] ? t("pack.includedWith", { lang: nameOfCode(l.includedWith[0]) }) : null;

    const description = l.builtIn
      ? t("pack.builtInDesc")
      : available
        ? [includedWith ?? t("pack.filesKept", { size: formatBytes(l.totalBytes) }), licenses, attribution].filter(Boolean).join(" · ")
        : [
            l.sizeBytes === 0 && !l.installed ? t("pack.sizeShared") : t("pack.size", { size: formatBytes(l.sizeBytes || l.totalBytes) }),
            licenses,
            attribution,
          ]
            .filter(Boolean)
            .join(" · ");

    return (
      <div className="pack" key={l.code}>
        <div className="pack__main">
          <div className="pack__title">
            <strong>{nameOf(l)}</strong>
            {l.nativeName !== nameOf(l) && (
              <span className="pack__native" lang={l.code}>
                {l.nativeName}
              </span>
            )}
            {l.beta && (
              <span className="beta-badge" title={t("lang.betaHint")}>
                {t("lang.beta")}
              </span>
            )}
            {l.builtIn ? (
              <Chip tone="success">{t("pack.builtIn")}</Chip>
            ) : busy ? (
              <Chip tone="brand">{phaseText}</Chip>
            ) : failed ? (
              <Chip tone="warn">{t("pack.failed")}</Chip>
            ) : l.installed ? (
              <Chip tone="success">{t("packs.installed")}</Chip>
            ) : l.available ? (
              <Chip>{t("pack.inactive")}</Chip>
            ) : (
              <Chip>{t("packs.notInstalled")}</Chip>
            )}
          </div>
          <div className="pack__meta">{description}</div>
          {busy && (
            <div className="pack__progress">
              <ProgressBar value={p?.done ?? 0} max={p?.total} label={nameOf(l)} />
              {p?.total ? (
                <span>
                  {formatBytes(p.done)} / {formatBytes(p.total)}
                </span>
              ) : null}
            </div>
          )}
          {failed && <div className="pack__error">{packErrorText(t, p.errorCode, p.error)}</div>}
        </div>
        <div className="pack__actions">
          {!l.builtIn && busy && <Button onClick={() => void packs.cancel(l.code)}>{t("common.cancel")}</Button>}
          {!l.builtIn && !busy && !l.available && (
            <Button variant="primary" icon="download" onClick={() => void packs.install(l.code)}>
              {failed ? t("pack.retry") : t("packs.download")}
            </Button>
          )}
          {available && (
            <>
              {unused && (
                <Button
                  variant="ghost"
                  onClick={() =>
                    setDeleteOffer({
                      language: l,
                      modelIds: l.models.map((m) => m.id),
                      freedBytes: l.totalBytes,
                    })
                  }
                >
                  {t("pack.deleteFiles")}
                </Button>
              )}
              {l.installed && (
                <Button variant="ghost" onClick={() => void packs.repair(l.code)} title={t("pack.repairHint")}>
                  {t("pack.repair")}
                </Button>
              )}
              <label className="pack__toggle">
                <Switch label={t("pack.toggle", { lang: nameOf(l) })} checked={l.installed} onChange={(on) => void toggle(l, on)} />
                {l.installed ? t("pack.active") : t("pack.inactive")}
              </label>
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      <p className="page-note">{t("packs.desc")}</p>
      <Section>{sortLanguages(packs.languages, locale).map(row)}</Section>
      <OcrSection />
      <Dialog
        open={!!deleteOffer}
        title={deleteOffer ? t("pack.deleteTitle", { lang: nameOf(deleteOffer.language) }) : ""}
        onClose={() => setDeleteOffer(null)}
        footer={
          <>
            <Button onClick={() => setDeleteOffer(null)}>{t("pack.keepFiles")}</Button>
            <Button
              variant="primary"
              icon="trash"
              onClick={() => {
                if (deleteOffer) void ipc.deleteModelFiles(deleteOffer.modelIds);
                setDeleteOffer(null);
              }}
            >
              {t("pack.deleteFiles")}
            </Button>
          </>
        }
      >
        {deleteOffer && <p>{t("pack.deleteBody", { size: formatBytes(deleteOffer.freedBytes) })}</p>}
      </Dialog>
    </>
  );
}
