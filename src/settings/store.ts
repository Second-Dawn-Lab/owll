import { createSettingsStore } from "@seconddawn/settings";
import { ipc } from "../ipc";
import { defaultSettings, type Settings } from "./defaults";

export const settingsStore = createSettingsStore<Settings>(defaultSettings, {
  load: ipc.getSettings,
  save: ipc.setSettings,
  subscribe: ipc.onSettingsChanged,
});
