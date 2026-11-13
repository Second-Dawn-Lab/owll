import type { QualityPack, QualityStatus } from "../ipc";

/** The models in the order of the list: recommended, alternative, for writing. */
export function sortedModels(models: QualityPack[]): QualityPack[] {
  const order = ["recommended", "alternative", "writing"];
  return [...models].sort((a, b) => order.indexOf(a.tier) - order.indexOf(b.tier));
}

/** The chosen model is not installed and another one is used instead: both names, else null. */
export function inUseNote(status: Pick<QualityStatus, "models" | "selectedModel" | "requestedModel">): { requested: string; used: string } | null {
  const requested = status.models.find((m) => m.id === status.requestedModel);
  const used = status.models.find((m) => m.id === status.selectedModel);
  if (!requested || !used || requested.installed || requested.id === used.id) return null;
  return { requested: requested.name, used: used.name };
}
