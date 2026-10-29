import { useSettings } from "@seconddawn/settings";
import { Button, Checkbox, Chip, IconButton, Select } from "@seconddawn/ui";
import { useEffect, useState } from "react";
import { usePacks } from "../components/usePacks";
import { languageName, useT } from "../i18n";
import { ipc, type OcrStatus } from "../ipc";
import { settingsStore } from "./store";

const MAX_LANGUAGES = 3;

/** Which languages area selection and images are read in, and which engine handles each. */
export function CaptureLanguages() {
  const { t, locale } = useT();
  const { settings, patch } = useSettings(settingsStore);
  const packs = usePacks();
  const [status, setStatus] = useState<OcrStatus | null>(null);
  const automatic = settings.captureLanguages.length === 0;

  useEffect(() => {
    void ipc.ocrStatus().then(setStatus);
  }, [settings.captureLanguages, packs.epoch]);

  const chosen = status?.languages ?? [];
  const nameOf = (code: string) => languageName(code, locale, packs.languages.find((l) => l.code === code)?.name);
  const candidates = [{ code: "en" }, ...packs.languages.filter((l) => !l.builtIn)].filter((l) => !chosen.some((c) => c.code === l.code));

  const setLanguages = (codes: string[]) => void patch({ captureLanguages: codes });

  return (
    <div className="dw-row">
      <div className="dw-row__text">
        <div className="dw-row__title">{t("files.capture")}</div>
        <div className="dw-row__desc">{t("files.captureDesc")}</div>
        <div className="row-extra">
          <Checkbox checked={automatic} onChange={(on) => setLanguages(on ? [] : chosen.map((c) => c.code))}>
            {t("ocr.auto")}
          </Checkbox>
          <ul className="ocrlist">
            {chosen.map((l) => (
              <li key={l.code}>
                <strong>{nameOf(l.code)}</strong>
                {l.engine === "windows" ? (
                  <Chip tone="success">{t("ocr.engine.windows")}</Chip>
                ) : (
                  <>
                    <Chip tone="warn">{t("ocr.engine.none")}</Chip>
                    <Button variant="ghost" onClick={() => void ipc.openWindowsLanguageSettings()}>
                      {t("ocr.install")}
                    </Button>
                  </>
                )}
                {!automatic && (
                  <IconButton
                    icon="close"
                    label={t("ocr.remove", { lang: nameOf(l.code) })}
                    disabled={chosen.length <= 1}
                    onClick={() => setLanguages(chosen.filter((c) => c.code !== l.code).map((c) => c.code))}
                  />
                )}
              </li>
            ))}
          </ul>
          {!automatic && chosen.length < MAX_LANGUAGES && candidates.length > 0 && (
            <Select
              label={t("ocr.add")}
              value=""
              onChange={(code) => code && setLanguages([...chosen.map((c) => c.code), code])}
              options={[{ value: "", label: t("ocr.add") }, ...candidates.map((l) => ({ value: l.code, label: nameOf(l.code) }))]}
            />
          )}
        </div>
      </div>
    </div>
  );
}
