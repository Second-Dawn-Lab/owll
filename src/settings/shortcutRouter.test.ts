import { describe, expect, it } from "vitest";
import { parseShortcut, ShortcutRouter, type Binding, type KeyLike } from "./shortcutRouter";

const key = (code: string, mods: Partial<KeyLike> = {}): KeyLike => ({
  code,
  repeat: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  metaKey: false,
  ...mods,
});

const all: Binding[] = [
  { name: "translate", shortcut: "Ctrl+C C", enabled: true },
  { name: "capture", shortcut: "Ctrl+Shift+O", enabled: true },
  { name: "live", shortcut: "Ctrl+Shift+L", enabled: true },
];

describe("parsing", () => {
  it("reads single and double shortcuts", () => {
    expect(parseShortcut("Ctrl+Shift+L")).toMatchObject({ ctrl: true, shift: true, key: "L", double: false });
    expect(parseShortcut("Ctrl+L L")).toMatchObject({ ctrl: true, key: "L", double: true });
  });
  it("refuses anything else", () => {
    for (const bad of ["", "L", "Ctrl+L K", "Ctrl+L L L", "Hyper+L"]) expect(parseShortcut(bad)).toBeNull();
  });
});

describe("in-page shortcut routing, focused in a text box", () => {
  it("fires live captions while a text box has focus (the reported bug)", () => {
    const r = new ShortcutRouter(all);
    expect(r.onKeyDown(key("KeyL", { ctrlKey: true, shiftKey: true }), 0, true)).toEqual({ name: "live", consume: true });
  });
  it("fires capture and live from the same mechanism, in any focus", () => {
    const r = new ShortcutRouter(all);
    for (const editable of [true, false]) {
      expect(r.onKeyDown(key("KeyO", { ctrlKey: true, shiftKey: true }), 0, editable)?.name).toBe("capture");
      expect(r.onKeyDown(key("KeyL", { ctrlKey: true, shiftKey: true }), 0, editable)?.name).toBe("live");
    }
  });
  it("a double-press shortcut fires on the second press only, and the first press still copies", () => {
    const r = new ShortcutRouter(all);
    const c = key("KeyC", { ctrlKey: true });
    expect(r.onKeyDown(c, 0, true)).toBeNull();
    expect(r.onKeyDown(c, 200, true)).toEqual({ name: "translate", consume: true });
    expect(r.onKeyDown(c, 300, true)).toBeNull(); // three quick presses fire once
  });
  it("Ctrl+L, L works like the other double presses", () => {
    const r = new ShortcutRouter([{ name: "live", shortcut: "Ctrl+L L", enabled: true }]);
    const l = key("KeyL", { ctrlKey: true });
    expect(r.onKeyDown(l, 1000, true)).toBeNull();
    expect(r.onKeyDown(l, 1250, true)?.name).toBe("live");
  });
  it("a late second press, another key in between or auto-repeat does not fire", () => {
    const r = new ShortcutRouter(all);
    const c = key("KeyC", { ctrlKey: true });
    r.onKeyDown(c, 0, true);
    expect(r.onKeyDown(c, 401, true)).toBeNull();
    r.onKeyDown(c, 1000, true);
    r.onKeyDown(key("KeyV", { ctrlKey: true }), 1100, true);
    expect(r.onKeyDown(c, 1200, true)).toBeNull();
    r.onKeyDown(c, 2000, true);
    expect(r.onKeyDown({ ...c, repeat: true }, 2100, true)).toBeNull();
  });
  it("modifier keys alone do not interrupt a double press", () => {
    const r = new ShortcutRouter(all);
    const c = key("KeyC", { ctrlKey: true });
    r.onKeyDown(c, 0, true);
    expect(r.onKeyDown(key("ControlLeft", { ctrlKey: true }), 100, true)).toBeNull();
    expect(r.onKeyDown(c, 200, true)?.name).toBe("translate");
  });
});

describe("normal editing keeps working", () => {
  it("ignores plain typing, Ctrl+V/A and Shift+letter in a text box", () => {
    const r = new ShortcutRouter([
      { name: "live", shortcut: "Shift+L", enabled: true },
      { name: "capture", shortcut: "Ctrl+V", enabled: true },
    ]);
    expect(r.onKeyDown(key("KeyL"), 0, true)).toBeNull();
    expect(r.onKeyDown(key("KeyL", { shiftKey: true }), 0, true)).toBeNull();
    expect(r.onKeyDown(key("KeyV", { ctrlKey: true }), 0, true)).toBeNull();
    expect(r.onKeyDown(key("KeyA", { ctrlKey: true }), 0, true)).toBeNull();
    expect(r.onKeyDown(key("KeyL", { shiftKey: true }), 0, false)?.name).toBe("live"); // outside a text box it is a shortcut
  });
  it("never treats AltGr as a shortcut", () => {
    const r = new ShortcutRouter([{ name: "live", shortcut: "Ctrl+Alt+Q", enabled: true }]);
    expect(r.onKeyDown({ ...key("KeyQ", { ctrlKey: true, altKey: true }), altGraph: true }, 0, true)).toBeNull();
    expect(r.onKeyDown(key("KeyQ", { ctrlKey: true, altKey: true }), 0, true)?.name).toBe("live");
  });
  it("needs exactly the stored modifiers", () => {
    const r = new ShortcutRouter(all);
    expect(r.onKeyDown(key("KeyL", { ctrlKey: true }), 0, false)).toBeNull();
    expect(r.onKeyDown(key("KeyL", { ctrlKey: true, shiftKey: true, altKey: true }), 0, false)).toBeNull();
  });
  it("skips disabled shortcuts", () => {
    const r = new ShortcutRouter(all.map((b) => ({ ...b, enabled: b.name !== "live" })));
    expect(r.onKeyDown(key("KeyL", { ctrlKey: true, shiftKey: true }), 0, false)).toBeNull();
  });
});
