import { useCallback, useEffect, useState } from "react";
import { ipc, type LanguageInfo, type PackProgress } from "../ipc";

export function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 MB";
  const mb = bytes / 1_000_000;
  return mb >= 1000 ? `${(mb / 1000).toFixed(1)} GB` : `${Math.round(mb)} MB`;
}

/**
 * The language list with live download state. Used by the text tab (pickers, first-run state)
 * and the language packs page.
 */
export function usePacks() {
  const [languages, setLanguages] = useState<LanguageInfo[]>([]);
  const [progress, setProgress] = useState<Record<string, PackProgress>>({});
  /** Bumped whenever the installed set may have changed, so translations can be retried. */
  const [epoch, setEpoch] = useState(0);

  const reload = useCallback(() => {
    void ipc.listLanguages().then((list) => {
      setLanguages(list);
      setEpoch((e) => e + 1);
    });
  }, []);

  useEffect(() => {
    reload();
    const offChanged = ipc.onPacksChanged(reload);
    const offProgress = ipc.onPackProgress((p) => {
      setProgress((prev) => {
        const next = { ...prev };
        // Finished and cancelled installs need no row state; errors stay until the next attempt.
        if (p.phase === "done" || p.phase === "cancelled") delete next[p.code];
        else next[p.code] = p;
        return next;
      });
    });
    return () => {
      void offChanged.then((fn) => fn());
      void offProgress.then((fn) => fn());
    };
  }, [reload]);

  const clearError = (code: string) =>
    setProgress((prev) => {
      const next = { ...prev };
      delete next[code];
      return next;
    });

  return {
    languages,
    progress,
    epoch,
    reload,
    /** At least one language besides English is installed. */
    hasExtra: languages.some((l) => !l.builtIn && l.installed),
    loaded: languages.length > 0,
    isBusy: (code: string) => {
      const p = progress[code];
      return (!!p && p.phase !== "error") || !!languages.find((l) => l.code === code)?.downloading;
    },
    install: (code: string) => {
      clearError(code);
      return ipc.installLanguage(code);
    },
    cancel: (code: string) => ipc.cancelInstall(code),
    repair: (code: string) => {
      clearError(code);
      return ipc.repairLanguage(code);
    },
  };
}

export type Packs = ReturnType<typeof usePacks>;
