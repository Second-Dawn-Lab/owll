import { Button, Checkbox, Chip, Dialog, Icon, ProgressBar } from "@seconddawn/ui";
import { useEffect, useState } from "react";
import { languageName, useT } from "../i18n";
import { ipc } from "../ipc";
import type { Settings } from "../settings/defaults";
import { Kbd } from "../settings/ShortcutEditor";
import { choiceState, choicesSorted, planChoices } from "./onboardingState";
import { formatBytes, usePacks } from "./usePacks";

type Step = "welcome" | "languages" | "shortcuts";

/**
 * The first-run welcome in the main window: what Owl-L is, which languages to download, and the two
 * shortcuts. Skippable, and shown once: skipping or finishing both mark it as done.
 */
export function Onboarding() {
  const { t, locale } = useT();
  const packs = usePacks();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("welcome");
  const [settings, setSettings] = useState<Settings | null>(null);
  const [chosen, setChosen] = useState<string[]>([]);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    void ipc.getSettings().then((s) => {
      setSettings(s);
      setOpen(!s.onboardingDone);
    });
  }, []);

  if (!open) return null;

  const finish = () => {
    setOpen(false);
    void ipc.setSettings({ onboardingDone: true });
  };
  // Every language of the catalog, by the name shown in the UI language (as on the Language packs page).
  const choices = choicesSorted(packs.languages, locale, (l) => languageName(l.code, locale, l.name));
  const toggle = (code: string) => setChosen((c) => (c.includes(code) ? c.filter((x) => x !== code) : [...c, code]));
  const plan = planChoices(packs.languages, chosen);
  const apply = () => {
    setStarted(true);
    // Files that are already on disk (shared with another language) are only switched on.
    if (plan.activate.length > 0) void ipc.activateLanguages(plan.activate).then(() => packs.reload());
    plan.download.forEach((code) => void packs.install(code));
  };

  const skip = (
    <Button variant="ghost" onClick={finish}>
      {t("onboarding.skip")}
    </Button>
  );

  return (
    <Dialog
      open
      title={t(`onboarding.${step}.title`)}
      onClose={finish}
      footer={
        step === "welcome" ? (
          <>
            {skip}
            <Button variant="primary" onClick={() => setStep("languages")}>
              {t("onboarding.next")}
            </Button>
          </>
        ) : step === "languages" ? (
          <>
            {skip}
            {chosen.length > 0 && !started && (
              <Button icon={plan.download.length > 0 ? "download" : "check"} onClick={apply}>
                {plan.download.length > 0 ? t("onboarding.download", { size: formatBytes(plan.bytes) }) : t("onboarding.addNow")}
              </Button>
            )}
            <Button variant="primary" onClick={() => setStep("shortcuts")}>
              {t("onboarding.next")}
            </Button>
          </>
        ) : (
          <Button variant="primary" onClick={finish}>
            {t("onboarding.done")}
          </Button>
        )
      }
    >
      <div className="dw-section__body onboarding">
        {step === "welcome" && (
          <>
            <p className="onboarding__lead">{t("onboarding.welcome.lead")}</p>
            <ul className="onboarding__points">
              {(["offline", "private", "free"] as const).map((k) => (
                <li key={k}>
                  <Icon name="check" size={16} /> {t(`onboarding.point.${k}`)}
                </li>
              ))}
            </ul>
          </>
        )}

        {step === "languages" && (
          <>
            <p>{t("onboarding.languages.lead")}</p>
            <div className="onboarding__langs">
              {choices.map((l) => {
                const p = packs.progress[l.code];
                const name = languageName(l.code, locale, l.name);
                const state = choiceState(l);
                const detail =
                  state === "active"
                    ? t("packs.installed")
                    : state === "activate"
                      ? l.includedWith[0]
                        ? t("onboarding.activate", { lang: languageName(l.includedWith[0], locale) })
                        : t("pack.filesKept", { size: formatBytes(l.totalBytes) })
                      : formatBytes(l.sizeBytes || l.totalBytes);
                return (
                  <div key={l.code} className="onboarding__lang">
                    <Checkbox checked={state === "active" || chosen.includes(l.code)} disabled={started || state === "active"} onChange={() => toggle(l.code)}>
                      {name} {l.beta && <Chip tone="warn">{t("lang.beta")}</Chip>}
                      <span className="onboarding__size"> {detail}</span>
                    </Checkbox>
                    {packs.isBusy(l.code) && <ProgressBar value={p?.done ?? 0} max={p?.total} label={name} />}
                    {p?.phase === "error" && <span className="pack__error">{t("pack.failed")}</span>}
                  </div>
                );
              })}
            </div>
            <p className="onboarding__note">{t("onboarding.languages.note")}</p>
          </>
        )}

        {step === "shortcuts" && settings && (
          <>
            <p>{t("onboarding.shortcuts.lead")}</p>
            <div className="onboarding__shortcut">
              <Kbd keys={settings.translateShortcut.replace(/ /g, "+")} />
              <span>{t("shortcuts.translateDesc")}</span>
            </div>
            <div className="onboarding__shortcut">
              <Kbd keys={settings.captureShortcut} />
              <span>{t("shortcuts.captureDesc")}</span>
            </div>
            <p className="onboarding__note">{t("onboarding.shortcuts.note")}</p>
          </>
        )}
      </div>
    </Dialog>
  );
}
