import { useSettings } from "@seconddawn/settings";
import { RadioGroup, Row, Section, Switch } from "@seconddawn/ui";
import { useT } from "../i18n";
import { settingsStore } from "./store";

/** Settings of live captions: update speed and the look of the caption bar. */
export function LiveSettings() {
  const { t } = useT();
  const { settings, patch } = useSettings(settingsStore);
  return (
    <Section title={t("live.settings.title")} description={t("live.settings.body")}>
      <Row title={t("live.settings.speed")} description={t("live.settings.speedDesc")}>
        <RadioGroup
          name="liveSpeed"
          value={settings.liveSpeed}
          onChange={(v) => void patch({ liveSpeed: v })}
          options={[
            { value: "calm", label: t("live.speed.calm") },
            { value: "normal", label: t("live.speed.normal") },
            { value: "fast", label: t("live.speed.fast") },
          ]}
        />
      </Row>
      <Row title={t("live.settings.lines")} description={t("live.settings.linesDesc")}>
        <RadioGroup
          name="liveLines"
          value={String(settings.liveLines)}
          onChange={(v) => void patch({ liveLines: Number(v) })}
          options={["1", "2", "3"].map((n) => ({ value: n, label: n }))}
        />
      </Row>
      <Row title={t("live.settings.font")} description={t("live.settings.fontDesc", { size: settings.liveFontSize })}>
        <input className="range" type="range" min={16} max={48} step={2} value={settings.liveFontSize} aria-label={t("live.settings.font")} onChange={(e) => void patch({ liveFontSize: Number(e.target.value) })} />
      </Row>
      <Row title={t("live.settings.opacity")} description={t("live.settings.opacityDesc", { percent: Math.round(settings.liveOpacity * 100) })}>
        <input className="range" type="range" min={30} max={100} step={5} value={Math.round(settings.liveOpacity * 100)} aria-label={t("live.settings.opacity")} onChange={(e) => void patch({ liveOpacity: Number(e.target.value) / 100 })} />
      </Row>
      <Row title={t("live.settings.original")} description={t("live.settings.originalDesc")}>
        <Switch label={t("live.settings.original")} checked={settings.liveShowOriginal} onChange={(v) => void patch({ liveShowOriginal: v })} />
      </Row>
      <Row title={t("live.settings.save")} description={t("live.settings.saveDesc")}>
        <RadioGroup
          name="liveSave"
          value={settings.liveSaveChoice}
          onChange={(v) => void patch({ liveSaveChoice: v })}
          options={[
            { value: "ask", label: t("live.save.ask") },
            { value: "always", label: t("live.save.always") },
            { value: "never", label: t("live.save.never") },
          ]}
        />
      </Row>
    </Section>
  );
}
