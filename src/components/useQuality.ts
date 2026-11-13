import { useSettings } from "@seconddawn/settings";
import type { QualityState, QualityStatus } from "../ipc";
import { settingsStore } from "../settings/store";
import { refreshQuality, useQualityStatus } from "./qualityStore";

/**
 * Is Quality mode switched on and usable? With the mode off nothing is asked of the backend at all, so people who do not
 * use it pay nothing. The status is shared by every component of the window (see `qualityStore`).
 */
export function useQuality(): { on: boolean; ready: boolean; state: QualityState; status: QualityStatus | null; refresh: () => void } {
  const { settings } = useSettings(settingsStore);
  const on = settings.qualityMode !== "off";
  const status = useQualityStatus(on, [settings.qualityMode, settings.qualityModel, settings.ollamaModel]);
  return { on, ready: on && !!status?.ready, state: on ? (status?.state ?? "not_set_up") : "off", status, refresh: refreshQuality };
}
