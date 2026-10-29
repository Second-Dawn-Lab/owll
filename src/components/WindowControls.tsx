import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useRef, useState } from "react";
import { useT } from "../i18n";
import { ipc, isTauri } from "../ipc";

/** Minimize, maximize/restore and close for a window without a native title bar. */
export function WindowControls({ canMinimize = true, canMaximize = true }: { canMinimize?: boolean; canMaximize?: boolean }) {
  const { t } = useT();
  const [maximized, setMaximized] = useState(false);
  const [snapHover, setSnapHover] = useState(false);
  const maxRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isTauri) return;
    const win = getCurrentWindow();
    const sync = () => void win.isMaximized().then(setMaximized);
    sync();
    const resized = win.onResized(sync);

    // Tell the backend where the maximize button is, so Windows shows Snap Layouts over it.
    const report = () => {
      const el = maxRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const s = window.devicePixelRatio;
      void ipc.setMaximizeRect([Math.round(r.left * s), Math.round(r.top * s), Math.round(r.right * s), Math.round(r.bottom * s)]);
    };
    report();
    const observer = new ResizeObserver(report);
    if (maxRef.current) observer.observe(maxRef.current);
    window.addEventListener("resize", report);
    const hover = ipc.onMaximizeHover(setSnapHover);
    return () => {
      void resized.then((fn) => fn());
      void hover.then((fn) => fn());
      observer.disconnect();
      window.removeEventListener("resize", report);
    };
  }, []);

  if (!isTauri) return null;
  const win = getCurrentWindow();
  return (
    <div className="winctl">
      {canMinimize && (
        <button type="button" className="winctl__btn" aria-label={t("window.minimize")} title={t("window.minimize")} onClick={() => void win.minimize()}>
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <path d="M0 5h10" />
          </svg>
        </button>
      )}
      {canMaximize && (
        <button
          ref={maxRef}
          type="button"
          className={snapHover ? "winctl__btn winctl__btn--hover" : "winctl__btn"}
          aria-label={maximized ? t("window.restore") : t("window.maximize")}
          title={maximized ? t("window.restore") : t("window.maximize")}
          onClick={() => void win.toggleMaximize()}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            {maximized ? <path d="M2.5 2.5V.5h7v7h-2M.5 2.5h7v7h-7z" /> : <path d="M.5.5h9v9h-9z" />}
          </svg>
        </button>
      )}
      <button type="button" className="winctl__btn winctl__btn--close" aria-label={t("window.close")} title={t("window.close")} onClick={() => void win.close()}>
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <path d="M0 0l10 10M10 0L0 10" />
        </svg>
      </button>
    </div>
  );
}
