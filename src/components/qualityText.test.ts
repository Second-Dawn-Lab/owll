import { describe, expect, it } from "vitest";
import type { QualityPack } from "../ipc";
import { inUseNote, sortedModels } from "./qualityText";

const pack = (id: string, name: string, tier: string, installed: boolean): QualityPack => ({ id, name, tier, description: "", details: "", sizeBytes: 1, ramBytes: 1, installed, installing: false, license: "MIT", attribution: "", sourceUrl: "", languages: [] });
const models = [pack("phi", "Phi-4 mini", "writing", true), pack("hy", "Hy-MT2 1.8B", "recommended", false), pack("ix", "Index-Translate 2B", "alternative", false)];

describe("model list", () => {
  it("is ordered recommended, alternative, for writing", () => {
    expect(sortedModels(models).map((m) => m.id)).toEqual(["hy", "ix", "phi"]);
  });

  it("says which model is used when the chosen one is not installed (only Phi-4 mini installed)", () => {
    expect(inUseNote({ models, selectedModel: "phi", requestedModel: "hy" })).toEqual({ requested: "Hy-MT2 1.8B", used: "Phi-4 mini" });
  });

  it("says nothing when the chosen model is installed, nothing is chosen, or nothing is installed", () => {
    const both = models.map((m) => (m.id === "hy" ? { ...m, installed: true } : m));
    expect(inUseNote({ models: both, selectedModel: "hy", requestedModel: "hy" })).toBeNull();
    expect(inUseNote({ models, selectedModel: "phi", requestedModel: "" })).toBeNull();
    expect(inUseNote({ models, selectedModel: "", requestedModel: "hy" })).toBeNull();
  });
});
