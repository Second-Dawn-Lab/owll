import { useSettings } from "@seconddawn/settings";
import { Icon } from "@seconddawn/ui";
import { useT } from "../i18n";
import { ipc } from "../ipc";
import { settingsStore } from "../settings/store";
import { Dropdown } from "./Dropdown";
import { toneAvailable, type Tone } from "./toneLanguages";
import { useQuality } from "./useQuality";

/**
 * Formal / Informal / Automatic, next to the target language. Shown for languages where it matters; without a usable
 * Quality mode it is visible but disabled, with a small lock whose tooltip says what turns it on; a click on the lock
 * opens the Quality mode settings.
 */
export function TonePicker({ language, compact = true }: { language: string; compact?: boolean }) {
  const { t } = useT();
  const { settings, patch } = useSettings(settingsStore);
  const quality = useQuality();
  if (!toneAvailable(language)) return null;
  const hint = quality.ready ? t("tone.hint") : quality.on ? t("tone.hintUnavailable") : t("tone.hintOff");
  return (
    <span className="tonepick" title={hint}>
      <Dropdown<Tone>
        compact={compact}
        align="end"
        label={t("tone.label")}
        disabled={!quality.ready}
        value={settings.tone}
        options={[
          { value: "automatic", label: t("tone.automatic") },
          { value: "formal", label: t("tone.formal") },
          { value: "informal", label: t("tone.informal") },
        ]}
        onChange={(tone) => void patch({ tone })}
      />
      {!quality.ready && (
        <button type="button" className="tonepick__lock" title={hint} aria-label={hint} onClick={() => void ipc.openSettings("quality")}>
          <Icon name="lock" size={13} />
        </button>
      )}
    </span>
  );
}
