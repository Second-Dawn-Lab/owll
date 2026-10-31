import { Button, Chip, Dialog, Menu, Nav, type MenuEntry, type NavItem } from "@seconddawn/ui";
import { useSettings } from "@seconddawn/settings";
import { useEffect, useRef, useState } from "react";
import { useT } from "../i18n";
import { ipc, isTauri, type CaptureResult, type DraftInfo, type HistoryEntry } from "../ipc";
import { settingsStore } from "../settings/store";
import { checkForUpdate, quietCheckAtStartup } from "../updater";
import { AboutCard } from "./AboutCard";
import { ActivationOfferDialog } from "./ActivationOfferDialog";
import { CloseDialog } from "./CloseDialog";
import { FilesTab } from "./FilesTab";
import { HistoryTab } from "./HistoryTab";
import { Onboarding } from "./Onboarding";
import { dropTarget } from "./docFiles";
import { EditorView } from "./EditorView";
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
  /** The area capture whose text is in the Text tab: its image, and the language it was read with. */
  const [captureNote, setCaptureNote] = useState<{ id: number; imageUrl: string; ocrLanguage: string | null } | null>(null);
  const quickCount = useRef(1000);
  const { settings } = useSettings(settingsStore);
  /** An area capture shown in the Images tab. */
  const [captured, setCaptured] = useState<CaptureResult | null>(null);
  /** A document or picture dropped on the window (Tauri reports its path). */
  const [droppedDocs, setDroppedDocs] = useState<{ paths: string[]; n: number } | null>(null);
  const [droppedImage, setDroppedImage] = useState<{ path: string; n: number } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  /** The draft open in the editor, and a counter that tells the drafts list to reload when the editor closes. */
  const [editing, setEditing] = useState<{ draftId: string; n: number } | null>(null);
  const [draftsKey, setDraftsKey] = useState(0);
  const editCount = useRef(0);
  /** An unfinished edit found at start: "Continue editing <file>?" */
  const [resumeOffer, setResumeOffer] = useState<DraftInfo | null>(null);
  useEffect(() => {
    void ipc
      .draftsList()
      .then((list) => setResumeOffer(list.find((d) => d.edited > 0 && d.status !== "missing") ?? null))
      .catch(() => undefined);
  }, []);
  const openEditor = (draftId: string) => setEditing({ draftId, n: ++editCount.current });
  const closeEditor = () => {
    setEditing(null);
    setDraftsKey((k) => k + 1);
  };
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
        if (result.text.trim() && !result.problem) {
          // The recognized text is ordinary text in the Text tab: edit it, copy it, use word alternatives and the glossary.
          setCaptured(null);
          setQuick({ text: result.text, n: ++quickCount.current });
          setCaptureNote({ id: result.id, imageUrl: result.imageUrl, ocrLanguage: result.ocrLanguage });
          setTab("text");
        } else {
          // Nothing recognized: the Images tab explains why and offers to try again.
          setCaptureNote(null);
          setCaptured(result);
          setTab("images");
        }
      });
    take();
    const unlisten = ipc.onCaptureResult(take);
    return () => void unlisten.then((fn) => fn());
  }, []);

  // The user picked a source language that differs from what the capture was read with: read the same
  // capture again (the pixels are still in memory), so no new screenshot is needed.
  useEffect(() => {
    const language = settings.sourceLanguage;
    if (!captureNote || language === "auto" || language === captureNote.ocrLanguage) return;
    const id = captureNote.id;
    void ipc.ocrCaptureAgain(language).then((out) => {
      if (out.text.trim()) setQuick({ text: out.text, n: ++quickCount.current });
      setCaptureNote((note) => (note && note.id === id ? { ...note, ocrLanguage: language } : note));
    });
  }, [settings.sourceLanguage, captureNote?.id]);

  // Files dropped on the window: documents open the Files tab, pictures the Images tab.
  useEffect(() => {
    let n = 0;
    const unlisten = isTauri
      ? import("@tauri-apps/api/webview").then(({ getCurrentWebview }) =>
          getCurrentWebview().onDragDropEvent((event) => {
            // While files are dragged over the window the whole content area lights up as the drop target.
            if (event.payload.type === "enter" || event.payload.type === "over") {
              setDragging(true);
              return;
            }
            setDragging(false);
            if (event.payload.type !== "drop") return;
            const paths = event.payload.paths;
            // Several documents of any mix of types go to the Files tab together.
            const documents = paths.filter((p) => dropTarget(p) === "document");
            if (documents.length > 0) {
              setDroppedDocs({ paths: documents, n: ++n });
              setTab("files");
              return;
            }
            const image = paths.find((p) => dropTarget(p) === "image");
            if (image) {
              setDroppedImage({ path: image, n: ++n });
              setTab("images");
            }
          }),
        )
      : Promise.resolve(() => {});
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
    { label: t("menu.live"), icon: "scan", onSelect: () => void ipc.liveToggle() },
    { label: t("menu.settings"), icon: "settings", separator: true, onSelect: () => void ipc.openSettings() },
    { label: t("menu.packs"), icon: "package", onSelect: () => void ipc.openSettings("packs") },
    { label: t("menu.updates"), icon: "download", separator: true, onSelect: () => void checkForUpdate(false) },
    { label: t("menu.about"), icon: "info", onSelect: () => setAboutOpen(true) },
    { label: t("menu.quit"), icon: "close", separator: true, onSelect: () => void ipc.quit() },
  ];

  return (
    <div className="shell">
      <header className="topbar" data-tauri-drag-region>
        <Menu label={t("menu.open")} icon="menu" entries={menu} open={menuOpen} onOpenChange={setMenuOpen} />
        <Nav
          variant="bar"
          label={t("nav.main")}
          items={tabs}
          value={tab}
          onChange={(next) => {
            // Leaving the editor keeps its draft; it can be continued from the Files tab.
            if (editing) closeEditor();
            setTab(next);
          }}
        />
        <span className="topbar__spacer" data-tauri-drag-region />
        <Chip tone="success" icon="shield" title={t("chip.offlineHint")}>
          {t("chip.offline")}
        </Chip>
        <WindowControls />
      </header>

      <main className="content">
        {dragging && (
          <div className="dropveil" aria-hidden="true">
            <span>{t("files.dropHere")}</span>
          </div>
        )}
        {/* The text tab stays mounted so unsent text and undo history survive tab switches. */}
        <div className="tabpanel" hidden={tab !== "text" || !!editing}>
          <TextTab incoming={incoming} quick={quick} capture={captureNote} onDismissCapture={() => setCaptureNote(null)} />
        </div>
        {tab === "images" && !editing && <ImagesTab captured={captured} dropped={droppedImage} />}
        {/* The Files tab stays mounted while a document is edited, so its list is still there afterwards. */}
        {tab === "files" && (
          <div className="tabpanel" hidden={!!editing}>
            <FilesTab incoming={droppedDocs} onEdit={openEditor} draftsKey={draftsKey} />
          </div>
        )}
        {editing && <EditorView key={editing.n} draftId={editing.draftId} onClose={closeEditor} />}
        {tab === "history" && !editing && (
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

      <Dialog
        open={resumeOffer !== null}
        title={t("ed.continueTitle")}
        onClose={() => setResumeOffer(null)}
        footer={
          <>
            <Button onClick={() => setResumeOffer(null)}>{t("ed.later")}</Button>
            <Button
              variant="primary"
              onClick={() => {
                if (resumeOffer) {
                  setTab("files");
                  openEditor(resumeOffer.id);
                }
                setResumeOffer(null);
              }}
            >
              {t("drafts.continue")}
            </Button>
          </>
        }
      >
        <p>{t("ed.continueBody", { name: resumeOffer?.name ?? "" })}</p>
      </Dialog>

      <Onboarding />
      <UpdateNotice />
      <CloseDialog />
      <ActivationOfferDialog />
    </div>
  );
}
