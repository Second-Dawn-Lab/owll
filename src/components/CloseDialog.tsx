import { Button, Checkbox, Dialog } from "@seconddawn/ui";
import { useEffect, useState } from "react";
import { useT } from "../i18n";
import { ipc } from "../ipc";

/** Shown when the window is closed while the setting is "ask each time". */
export function CloseDialog() {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [remember, setRemember] = useState(false);

  useEffect(() => {
    const unlisten = ipc.onCloseRequested(() => setOpen(true));
    return () => void unlisten.then((fn) => fn());
  }, []);

  const answer = (action: "background" | "quit") => {
    setOpen(false);
    void ipc.closeAction(action, remember);
  };

  return (
    <Dialog
      open={open}
      title={t("close.title")}
      onClose={() => setOpen(false)}
      footer={
        <>
          <Button onClick={() => answer("quit")}>{t("close.quit")}</Button>
          <Button variant="primary" onClick={() => answer("background")}>
            {t("close.background")}
          </Button>
        </>
      }
    >
      <p>{t("close.body")}</p>
      <Checkbox checked={remember} onChange={setRemember}>
        {t("close.remember")}
      </Checkbox>
    </Dialog>
  );
}
