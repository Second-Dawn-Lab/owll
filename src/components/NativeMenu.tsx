import { IconButton, Menu, type MenuEntry } from "@seconddawn/ui";
import { useState } from "react";
import { windowLabel } from "../ipc";
import { opensListsInOwnWindow, pickFromList } from "./nativePicker";

/**
 * A menu button. In the quick popup (too small for a menu) the entries open in a window of their own; elsewhere it is the usual
 * menu. The entries and their actions are the same either way.
 */
export function NativeMenu({ label, entries }: { label: string; entries: MenuEntry[] }) {
  const [open, setOpen] = useState(false);
  if (!opensListsInOwnWindow(windowLabel())) return <Menu label={label} icon="more" entries={entries} open={open} onOpenChange={setOpen} />;
  return (
    <IconButton
      icon="more"
      label={label}
      onClick={async (e) => {
        const chosen = await pickFromList(
          e.currentTarget.getBoundingClientRect(),
          entries.map((entry, i) => ({ kind: "item", value: String(i), label: entry.label })),
        );
        if (chosen !== null) entries[Number(chosen)]?.onSelect();
      }}
    />
  );
}
