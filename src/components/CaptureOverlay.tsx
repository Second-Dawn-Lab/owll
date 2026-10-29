import { useEffect, useRef, useState } from "react";
import { useT } from "../i18n";
import { ipc, windowLabel } from "../ipc";
import { trace } from "../trace";

interface Drag {
  start: [number, number];
  end: [number, number];
}

/** The rectangle between two points, kept inside the window. */
function rectOf(drag: Drag): [number, number, number, number] {
  const clamp = (v: number, max: number) => Math.min(Math.max(v, 0), max);
  const x0 = clamp(drag.start[0], window.innerWidth);
  const y0 = clamp(drag.start[1], window.innerHeight);
  const x1 = clamp(drag.end[0], window.innerWidth);
  const y1 = clamp(drag.end[1], window.innerHeight);
  return [Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0)];
}

/**
 * One full-screen overlay per monitor. It shows that monitor's frozen screenshot, dimmed, and
 * the user drags a rectangle over it. The backend crops the selection from its own copy of the
 * screenshot, so this page only reports the rectangle.
 */
export function CaptureOverlay() {
  const { t } = useT();
  const label = windowLabel();
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragging = useRef(false);

  useEffect(() => {
    const take = () => {
      setImageUrl(null);
      setDrag(null);
      void ipc.captureOverlayInfo(label).then((info) => info && setImageUrl(info.imageUrl));
    };
    take(); // the overlay may have been opened before this page finished loading
    const unlisten = ipc.onCaptureOpen(take);
    return () => void unlisten.then((fn) => fn());
  }, [label]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") void ipc.captureCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const finish = (d: Drag) => {
    const rect = rectOf(d);
    if (rect[2] < 8 || rect[3] < 8) {
      void ipc.captureCancel(); // a tiny drag is an accident
      return;
    }
    trace(`capture: selection ${Math.round(rect[2])}x${Math.round(rect[3])}`);
    void ipc.captureFinish(label, rect, [window.innerWidth, window.innerHeight]);
  };

  const rect = drag ? rectOf(drag) : null;
  const scale = window.devicePixelRatio;
  return (
    <div
      className="cap"
      onContextMenu={(e) => {
        e.preventDefault();
        void ipc.captureCancel();
      }}
      onMouseDown={(e) => {
        if (e.button !== 0) return;
        dragging.current = true;
        setDrag({ start: [e.clientX, e.clientY], end: [e.clientX, e.clientY] });
      }}
      onMouseMove={(e) => dragging.current && setDrag((d) => d && { ...d, end: [e.clientX, e.clientY] })}
      onMouseUp={(e) => {
        if (!dragging.current || e.button !== 0) return;
        dragging.current = false;
        if (drag) finish({ ...drag, end: [e.clientX, e.clientY] });
      }}
    >
      {imageUrl && (
        <img
          className="cap__image"
          src={imageUrl}
          alt=""
          draggable={false}
          onLoad={(e) => void e.currentTarget.decode().finally(() => void ipc.captureOverlayReady(label))}
        />
      )}
      {!rect && <div className="cap__dim" />}
      {rect && (
        <div className="cap__box" style={{ left: rect[0], top: rect[1], width: rect[2], height: rect[3] }}>
          <span className="cap__size">
            {Math.round(rect[2] * scale)} × {Math.round(rect[3] * scale)}
          </span>
        </div>
      )}
      <div className="cap__hint">{t("capture.hint")}</div>
    </div>
  );
}
