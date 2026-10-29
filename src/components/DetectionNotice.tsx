import { Button, Icon, ProgressBar } from "@seconddawn/ui";
import { languageName, useT } from "../i18n";
import { ipc, type LanguageInfo } from "../ipc";
import { LanguagePicker } from "./LanguagePicker";
import type { TranslatorState } from "./useTranslator";
import { formatBytes, type usePacks } from "./usePacks";

type Packs = ReturnType<typeof usePacks>;

/**
 * Shown instead of a translation when the language of the text is unknown, or known but its
 * pack is missing: "German detected · not installed" with a one-click fix, or a source picker.
 */
export function DetectionNotice({
  state,
  packs,
  onPickSource,
}: {
  state: TranslatorState;
  packs: Packs;
  onPickSource: (code: string) => void;
}) {
  const { t, locale } = useT();

  if (state.status === "undetected") {
    return (
      <div className="pane__error" role="status">
        <Icon name="alert" size={20} />
        <strong>{t("detect.unsure")}</strong>
        <span>{t("detect.pick")}</span>
        <LanguagePicker
          label={t("lang.source")}
          value="auto"
          languages={packs.languages.filter((l) => l.installed || l.builtIn)}
          allowAuto
          onChange={(code) => code !== "auto" && onPickSource(code)}
        />
      </div>
    );
  }

  const code = state.detected;
  if (state.status !== "unavailable" || !code) return null;
  const lang: LanguageInfo | undefined = packs.languages.find((l) => l.code === code);
  const name = languageName(code, locale, lang?.name);
  const busy = packs.isBusy(code);
  const progress = packs.progress[code];
  const inactive = !!lang && lang.available && !lang.installed;

  return (
    <div className="pane__error" role="status">
      <Icon name="globe" size={20} />
      <strong>{t(inactive ? "detect.inactive" : lang ? "detect.notInstalled" : "detect.unsupported", { lang: name })}</strong>
      {busy ? (
        <>
          <ProgressBar value={progress?.done ?? 0} max={progress?.total} label={name} />
          <Button onClick={() => void packs.cancel(code)}>{t("common.cancel")}</Button>
        </>
      ) : inactive ? (
        <Button variant="primary" onClick={() => void ipc.activateLanguage(code)}>
          {t("detect.activate", { lang: name })}
        </Button>
      ) : lang ? (
        <Button variant="primary" icon="download" onClick={() => void packs.install(code)}>
          {t("detect.download", { lang: name, size: formatBytes(lang.sizeBytes || lang.totalBytes) })}
        </Button>
      ) : null}
    </div>
  );
}
