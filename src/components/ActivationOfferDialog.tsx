import { Button, Checkbox, Dialog } from "@seconddawn/ui";
import { useCallback, useEffect, useState } from "react";
import { languageName, useT } from "../i18n";
import { ipc, type ActivationOffer, type LanguageInfo } from "../ipc";

/**
 * Shown right after a download that made other languages available (they share its models):
 * lists them, unticked, and activates the ones the user picks. Each model asks only once; the
 * backend hands the question out a single time.
 */
export function ActivationOfferDialog() {
  const { t, locale } = useT();
  const [offer, setOffer] = useState<ActivationOffer | null>(null);
  const [languages, setLanguages] = useState<LanguageInfo[]>([]);
  const [picked, setPicked] = useState<string[]>([]);

  const check = useCallback(() => {
    // Every open window hears about the offer; the one the user is looking at asks first.
    const delay = document.hasFocus() ? 0 : 400;
    window.setTimeout(() => {
      void ipc.takeActivationOffer().then(async (next) => {
        if (!next) return;
        setLanguages(await ipc.listLanguages());
        setPicked([]);
        setOffer(next);
      });
    }, delay);
  }, []);

  useEffect(() => {
    check();
    const off = ipc.onActivationOffer(check);
    return () => void off.then((fn) => fn());
  }, [check]);

  if (!offer) return null;
  const options = offer.languages
    .map((code) => languages.find((l) => l.code === code))
    .filter((l): l is LanguageInfo => !!l)
    .sort((a, b) => languageName(a.code, locale, a.name).localeCompare(languageName(b.code, locale, b.name), locale));
  const close = () => setOffer(null);
  const toggle = (code: string, on: boolean) => setPicked((p) => (on ? [...p, code] : p.filter((c) => c !== code)));

  return (
    <Dialog
      open
      title={t("offer.title")}
      onClose={close}
      footer={
        <>
          <Button variant="ghost" onClick={() => setPicked(options.map((l) => l.code))}>
            {t("offer.selectAll")}
          </Button>
          <Button onClick={close}>{t("offer.skip")}</Button>
          <Button
            variant="primary"
            disabled={picked.length === 0}
            onClick={() => {
              void ipc.activateLanguages(picked);
              close();
            }}
          >
            {t("offer.activate")}
          </Button>
        </>
      }
    >
      <p>{t("offer.body")}</p>
      <div className="offer-list">
        {options.map((l) => (
          <Checkbox key={l.code} checked={picked.includes(l.code)} onChange={(on) => toggle(l.code, on)}>
            <strong lang={l.code}>{l.nativeName}</strong> <span className="pack__native">{languageName(l.code, locale, l.name)}</span>
          </Checkbox>
        ))}
      </div>
    </Dialog>
  );
}
