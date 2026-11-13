import { createSettingsStore, type SettingsBackend } from "@seconddawn/settings";
import { describe, expect, it } from "vitest";

interface S {
  sourceLanguage: string;
  targetLanguage: string;
  tone: string;
}
const defaults: S = { sourceLanguage: "auto", targetLanguage: "de", tone: "automatic" };

/** A backend whose saves finish when the test says so, like a busy app. */
function slowBackend() {
  let server = { ...defaults };
  const waiting: (() => void)[] = [];
  let incoming: ((s: S) => void) | null = null;
  const backend: SettingsBackend<S> = {
    load: async () => ({ ...server }),
    save: (patch) =>
      new Promise((resolve) => {
        const snapshot = { ...server, ...patch };
        server = snapshot;
        waiting.push(() => resolve({ ...snapshot }));
      }),
    subscribe: async (cb) => {
      incoming = cb;
      return () => undefined;
    },
  };
  return { backend, finishNext: () => waiting.shift()?.(), push: (s: S) => incoming?.(s) };
}

describe("settings store", () => {
  it("a slow answer to an older change does not undo a newer one (swap after a tone change)", async () => {
    const { backend, finishNext } = slowBackend();
    const store = createSettingsStore(defaults, backend);
    await store.init();
    const first = store.patch({ tone: "formal" });
    // The user swaps while the first save is still running.
    const second = store.patch({ sourceLanguage: "de", targetLanguage: "en" });
    expect(store.getState()).toMatchObject({ sourceLanguage: "de", targetLanguage: "en", tone: "formal" });
    finishNext(); // the answer to the first save carries the old languages
    await first;
    expect(store.getState()).toMatchObject({ sourceLanguage: "de", targetLanguage: "en", tone: "formal" });
    finishNext();
    await second;
    expect(store.getState()).toMatchObject({ sourceLanguage: "de", targetLanguage: "en" });
  });

  it("a change announced by the backend does not undo a change still being saved, but later ones apply", async () => {
    const { backend, finishNext, push } = slowBackend();
    const store = createSettingsStore(defaults, backend);
    await store.init();
    const saving = store.patch({ targetLanguage: "en" });
    push({ ...defaults, tone: "informal" }); // an older snapshot of the languages arrives
    expect(store.getState()).toMatchObject({ targetLanguage: "en", tone: "informal" });
    finishNext();
    await saving;
    push({ ...defaults, targetLanguage: "fr" });
    expect(store.getState().targetLanguage).toBe("fr");
  });
});
