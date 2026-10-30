import { Nav, type NavItem } from "@seconddawn/ui";
import { useEffect, useState } from "react";
import { ActivationOfferDialog } from "../components/ActivationOfferDialog";
import { WindowControls } from "../components/WindowControls";
import { useT } from "../i18n";
import { ipc } from "../ipc";
import {
  AccessibilityPage,
  AdvancedPage,
  FilesPage,
  GeneralPage,
  PacksPage,
  ShortcutsPage,
} from "./pages";
import { GlossaryPage } from "./GlossaryPage";

type Page = "general" | "shortcuts" | "accessibility" | "files" | "packs" | "glossary" | "advanced";
const PAGES: Page[] = ["general", "shortcuts", "accessibility", "files", "packs", "glossary", "advanced"];

const asPage = (value: string | null): Page | undefined => PAGES.find((p) => p === value);

export function SettingsWindow() {
  const { t } = useT();
  const [page, setPage] = useState<Page>("general");

  useEffect(() => {
    // Requested page when the window is created, or a navigate event when it already exists.
    void ipc.takeSettingsPage().then((p) => {
      const next = asPage(p);
      if (next) setPage(next);
    });
    const unlisten = ipc.onSettingsNavigate((p) => {
      const next = asPage(p);
      if (next) setPage(next);
    });
    return () => void unlisten.then((fn) => fn());
  }, []);

  const items: NavItem<Page>[] = [
    { id: "general", label: t("page.general"), icon: "settings" },
    { id: "shortcuts", label: t("page.shortcuts"), icon: "keyboard" },
    { id: "accessibility", label: t("page.accessibility"), icon: "accessibility" },
    { id: "files", label: t("page.files"), icon: "folder" },
    { id: "packs", label: t("page.packs"), icon: "package" },
    { id: "glossary", label: t("page.glossary"), icon: "text" },
    { id: "advanced", label: t("page.advanced"), icon: "wrench" },
  ];

  return (
    <div className="settings">
      <header className="titlebar" data-tauri-drag-region>
        <span className="titlebar__title" data-tauri-drag-region>
          {t("settings.title")}
        </span>
        <WindowControls canMinimize={false} canMaximize={false} />
      </header>
      <aside className="settings__nav">
        <Nav label={t("settings.title")} items={items} value={page} onChange={setPage} />
      </aside>
      <main className="settings__page">
        <h2>{items.find((i) => i.id === page)?.label}</h2>
        {page === "general" && <GeneralPage />}
        {page === "shortcuts" && <ShortcutsPage />}
        {page === "accessibility" && <AccessibilityPage />}
        {page === "files" && <FilesPage />}
        {page === "packs" && <PacksPage />}
        {page === "glossary" && <GlossaryPage />}
        {page === "advanced" && <AdvancedPage />}
      </main>
      <ActivationOfferDialog />
    </div>
  );
}
