import { Button, Chip, Dialog, Menu, Nav, type MenuEntry, type NavItem } from "@seconddawn/ui";
import { useEffect, useState } from "react";
import { useT } from "../i18n";
import { ipc, type CaptureResult, type HistoryEntry } from "../ipc";
import { checkForUpdate, quietCheckAtStartup } from "../updater";
import { AboutCard } from "./AboutCard";
import { ActivationOfferDialog } from "./ActivationOfferDialog";
import { CloseDialog } from "./CloseDialog";
import { ComingSoon } from "./ComingSoon";
import { HistoryTab } from "./HistoryTab";
import { Onboarding } from "./Onboarding";
import { ImagesTab } from "./ImagesTab";
import { TextTab } from "./TextTab";
import { UpdateNotice } from "./UpdateNotice";
import { WindowControls } from "./WindowControls";

type Tab = "text" | "images" | "files" | "history";

export function MainWindow() {
  const { t } = useT();
  const [tab, setTab] = useState<Tab>("text");
  const [incoming, setIncoming] = useState<HistoryEntry | null>(null);
  /** Text sent here by quick access ("Open in Owl-L", or the shortcut with "main window" chosen). */
  const [quick, setQuick] = useState<{ text: string; n: number } | null>(null);
  /** An area capture shown in the Images tab. */
  const [captured, setCaptured] = useState<CaptureResult | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);

  useEffect(() => {
    let n = 0;
    const take = () =>
      void ipc.takeQuickText().then((text) => {
        if (text === null) return;
        setQuick({ text, n: ++n });
        setTab("text");
      });
    take();
    const unlisten = ipc.onQuickText(take);
    return () => void unlisten.then((fn) => fn());
  }, []);

  // An area capture finished: show it in the Images tab (the backend has already brought this window forward).
  useEffect(() => {
    let seen: number | null = null;
    const take = () =>
      void ipc.takeCaptureResult(seen).then((result) => {
        if (!result) return;
        seen = result.id;
        setCaptured(result);
        setTab("images");
      });
    take();
    const unlisten = ipc.onCaptureResult(take);
    return () => void unlisten.then((fn) => fn());
  }, []);

  // Quiet check for a new version, at most once a day (the backend decides).
  useEffect(() => {
    void quietCheckAtStartup();
  }, []);

  const tabs: NavItem<Tab>[] = [
    { id: "text", label: t("tab.text"), icon: "text" },
    { id: "images", label: t("tab.images"), icon: "image" },
    { id: "files", label: t("tab.files"), icon: "file" },
    { id: "history", label: t("tab.history"), icon: "clock" },
  ];

  const menu: MenuEntry[] = [
    { label: t("menu.settings"), icon: "settings", onSelect: () => void ipc.openSettings() },
    { label: t("menu.packs"), icon: "package", onSelect: () => void ipc.openSettings("packs") },
    { label: t("menu.updates"), icon: "download", separator: true, onSelect: () => void checkForUpdate(false) },
    { label: t("menu.about"), icon: "info", onSelect: () => setAboutOpen(true) },
    { label: t("menu.quit"), icon: "close", separator: true, onSelect: () => void ipc.quit() },
  ];

  return (
    <div className="shell">
      <header className="topbar" data-tauri-drag-region>
        <Menu label={t("menu.open")} icon="menu" entries={menu} open={menuOpen} onOpenChange={setMenuOpen} />
        <Nav variant="bar" label={t("nav.main")} items={tabs} value={tab} onChange={setTab} />
        <span className="topbar__spacer" data-tauri-drag-region />
        <Chip tone="success" icon="shield" title={t("chip.offlineHint")}>
          {t("chip.offline")}
        </Chip>
        <WindowControls />
      </header>

      <main className="content">
        {/* The text tab stays mounted so unsent text and undo history survive tab switches. */}
        <div className="tabpanel" hidden={tab !== "text"}>
          <TextTab incoming={incoming} quick={quick} />
        </div>
        {tab === "images" && <ImagesTab captured={captured} />}
        {tab === "files" && <ComingSoon icon="file" title={t("tab.files")} description="soon.files" />}
        {tab === "history" && (
          <HistoryTab
            onUse={(entry) => {
              setIncoming(entry);
              setTab("text");
            }}
          />
        )}
      </main>

      <Dialog
        open={aboutOpen}
        title={t("about.title")}
        onClose={() => setAboutOpen(false)}
        footer={<Button onClick={() => setAboutOpen(false)}>{t("common.close")}</Button>}
      >
        <div className="dw-section__body">
          <AboutCard />
        </div>
      </Dialog>

      <Onboarding />
      <UpdateNotice />
      <CloseDialog />
      <ActivationOfferDialog />
    </div>
  );
}
