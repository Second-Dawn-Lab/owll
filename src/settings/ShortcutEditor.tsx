import { Button, Checkbox, Dialog } from "@seconddawn/ui";
import { useEffect, useState } from "react";
import { useT } from "../i18n";
import { ipc, type ShortcutCheck } from "../ipc";

export function Kbd({ keys }: { keys: string }) {
  return (
    <span className="kbds">
      {keys.split("+").map((k) => (
        <kbd key={k}>{k.trim()}</kbd>
      ))}
    </span>
  );
}

/** The key part of a shortcut for a key event: a letter, digit, F1-F12 or Space. */
export function keyName(e: Pick<KeyboardEvent, "code">): string | null {
  const m = /^Key([A-Z])$/.exec(e.code) ?? /^Digit([0-9])$/.exec(e.code) ?? /^(F(?:[1-9]|1[0-2]))$/.exec(e.code);
  if (m) return m[1];
  return e.code === "Space" ? "Space" : null;
}

type Pressed = Pick<KeyboardEvent, "code" | "ctrlKey" | "altKey" | "shiftKey" | "metaKey">;

/** "Ctrl+Alt+T" or, when `twice`, "Ctrl+Alt+T T". Null without a modifier or with an unsupported key. */
export function buildShortcut(e: Pressed, twice: boolean): string | null {
  const key = keyName(e);
  const mods = [e.ctrlKey && "Ctrl", e.altKey && "Alt", e.shiftKey && "Shift", e.metaKey && "Win"].filter(Boolean);
  if (!key || mods.length === 0) return null;
  return `${mods.join("+")}+${twice ? `${key} ${key}` : key}`;
}

/** Dialog that records a new shortcut from the keyboard and checks it with the backend. */
export function ShortcutDialog({
  name,
  current,
  onSave,
  onClose,
}: {
  name: "translate" | "capture" | "live";
  current: string;
  onSave: (shortcut: string) => void;
  onClose: () => void;
}) {
  const { t } = useT();
  const [pressed, setPressed] = useState<Pressed | null>(null);
  const [twice, setTwice] = useState(current.includes(" "));
  const [check, setCheck] = useState<ShortcutCheck | null>(null);
  /** The last key pressed with a modifier cannot be part of a shortcut (arrows, punctuation, ...). */
  const [unsupported, setUnsupported] = useState(false);
  const candidate = pressed ? buildShortcut(pressed, twice) : null;

  useEffect(() => {
    if (!candidate) {
      setCheck(null);
      return;
    }
    let stale = false;
    void ipc.checkShortcut(name, candidate).then((c) => !stale && setCheck(c));
    return () => {
      stale = true;
    };
  }, [candidate, name]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Tab") return;
      e.preventDefault();
      if (!["Control", "Alt", "Shift", "Meta"].includes(e.key)) {
        const next = { code: e.code, ctrlKey: e.ctrlKey, altKey: e.altKey, shiftKey: e.shiftKey, metaKey: e.metaKey };
        setUnsupported(keyName(next) === null);
        setPressed(next);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  const conflictName = (n: string) => t(n === "capture" ? "shortcuts.capture" : n === "live" ? "shortcuts.live" : "shortcuts.translate");
  const usable = !!candidate && !!check?.valid;

  return (
    <Dialog
      open
      title={t("shortcuts.press")}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t("common.cancel")}</Button>
          <Button variant="primary" disabled={!usable} onClick={() => check?.canonical && onSave(check.canonical)}>
            {t("shortcuts.save")}
          </Button>
        </>
      }
    >
      <p className="page-note">{t("shortcuts.pressHint")}</p>
      <div className="shortcut-capture" aria-live="polite">
        <Kbd keys={candidate ?? current} />
      </div>
      <Checkbox checked={twice} onChange={setTwice}>
        {t("shortcuts.twice")}
      </Checkbox>
      {check?.error && <p className="shortcut-warn">{check.error}</p>}
      {check?.conflicts.map((c) => (
        <p key={c} className="shortcut-warn">
          {t("shortcuts.conflict", { other: conflictName(c) })}
        </p>
      ))}
      {unsupported && <p className="shortcut-warn">{t("shortcuts.unsupportedKey")}</p>}
      {candidate && !twice && !unsupported && <p className="shortcut-hint">{t("shortcuts.singleHint")}</p>}
      {check?.warning?.kind === "everyday" && <p className="shortcut-warn">{t("shortcuts.warn.everyday")}</p>}
      {check?.warning?.kind === "known" && (
        <p className="shortcut-warn">{t("shortcuts.warn.known", { keys: candidate ?? "", what: t(`shortcuts.known.${check.warning.id}` as "shortcuts.known.address") })}</p>
      )}
    </Dialog>
  );
}
