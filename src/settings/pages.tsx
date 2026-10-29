import { useSettings } from "@seconddawn/settings";
import { Button, Checkbox, Chip, Dialog, IconButton, Row, RadioGroup, Section, Select, Switch } from "@seconddawn/ui";
import { useEffect, useState } from "react";
import { AboutCard } from "../components/AboutCard";
import { useT } from "../i18n";
import { ipc } from "../ipc";
import { defaultSettings } from "./defaults";
import { CaptureLanguages } from "./CaptureLanguages";
import { Kbd, ShortcutDialog } from "./ShortcutEditor";
import { settingsStore } from "./store";

function useAppSettings() {
  return useSettings(settingsStore);
}

function useSoon() {
  const { t } = useT();
  return <Chip tone="warn">{t("soon.badge")}</Chip>;
}

export function GeneralPage() {
  const { t } = useT();
  const { settings, patch } = useAppSettings();
  return (
    <>
      <Section title={t("general.startup.section")}>
        <Row title={t("general.startup")} description={t("general.startupDesc")}>
          <Switch
            label={t("general.startup")}
            checked={settings.launchAtStart}
            onChange={(v) => void patch({ launchAtStart: v })}
          />
        </Row>
      </Section>

      <Section title={t("general.quick.section")}>
        <Row title={t("general.floating")} description={t("general.floatingDesc")} badge={<Chip tone="warn">{t("general.floatingBadge")}</Chip>}>
          <Switch label={t("general.floating")} checked={settings.floatingIcon} disabled onChange={() => {}} />
        </Row>
        <div className="dw-row">
          <div className="dw-row__text">
            <div className="dw-row__title">
              {t("general.quick")}
            </div>
            <div className="dw-row__desc">{t("general.quickDesc")}</div>
            <div className="row-extra">
              <RadioGroup
                name="quick"
                value={settings.quickAccess}
                onChange={(v) => void patch({ quickAccess: v })}
                options={[
                  { value: "popup", label: t("general.quickPopup") },
                  { value: "app", label: t("general.quickApp") },
                ]}
              />
              <Checkbox checked={settings.ignoreQuickAccessWithoutSelection} onChange={(v) => void patch({ ignoreQuickAccessWithoutSelection: v })}>
                {t("general.ignoreNoSelection")}
              </Checkbox>
            </div>
          </div>
        </div>
      </Section>

      <Section title={t("general.closing.section")}>
        <div className="dw-row">
          <RadioGroup
            name="close"
            value={settings.closeBehavior}
            onChange={(v) => void patch({ closeBehavior: v })}
            options={[
              { value: "ask", label: t("general.closeAsk") },
              { value: "background", label: t("general.closeBackground") },
              { value: "quit", label: t("general.closeQuit") },
            ]}
          />
        </div>
      </Section>

      <Section title={t("about.title")}>
        <AboutCard />
      </Section>
    </>
  );
}

export function ShortcutsPage() {
  const { t } = useT();
  const { settings, patch } = useAppSettings();
  const [editing, setEditing] = useState<"translate" | "capture" | null>(null);
  const [hookError, setHookError] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<{ translate: string[]; capture: string[] }>({ translate: [], capture: [] });

  useEffect(() => {
    void ipc.hotkeyStatus().then(setHookError);
    void Promise.all([ipc.checkShortcut("translate", settings.translateShortcut), ipc.checkShortcut("capture", settings.captureShortcut)]).then(
      ([a, b]) => setConflicts({ translate: a.conflicts, capture: b.conflicts }),
    );
  }, [settings.translateShortcut, settings.captureShortcut]);

  const conflictText = (name: "translate" | "capture") =>
    conflicts[name].map((c) => t("shortcuts.conflict", { other: t(c === "capture" ? "shortcuts.capture" : "shortcuts.translate") })).join(" ");
  return (
    <>
      <p className="page-note">{t("shortcuts.note")}</p>
      {hookError && <p className="shortcut-warn">{t("shortcuts.hookFailed", { error: hookError })}</p>}
      <Section>
        <Row title={t("shortcuts.translate")} description={[t("shortcuts.translateDesc"), conflictText("translate")].filter(Boolean).join(" ")}>
          <Kbd keys={settings.translateShortcut} />
          <Button onClick={() => setEditing("translate")}>{t("shortcuts.change")}</Button>
          <Button
            variant="ghost"
            disabled={settings.translateShortcut === defaultSettings.translateShortcut}
            onClick={() => void patch({ translateShortcut: defaultSettings.translateShortcut })}
          >
            {t("shortcuts.reset")}
          </Button>
          <Switch
            label={t("shortcuts.translate")}
            checked={settings.translateShortcutEnabled}
            onChange={(v) => void patch({ translateShortcutEnabled: v })}
          />
        </Row>
        <Row title={t("shortcuts.capture")} description={[t("shortcuts.captureDesc"), conflictText("capture")].filter(Boolean).join(" ")}>
          <Kbd keys={settings.captureShortcut} />
          <Button onClick={() => setEditing("capture")}>{t("shortcuts.change")}</Button>
          <Button
            variant="ghost"
            disabled={settings.captureShortcut === defaultSettings.captureShortcut}
            onClick={() => void patch({ captureShortcut: defaultSettings.captureShortcut })}
          >
            {t("shortcuts.reset")}
          </Button>
          <Switch
            label={t("shortcuts.capture")}
            checked={settings.captureShortcutEnabled}
            onChange={(v) => void patch({ captureShortcutEnabled: v })}
          />
        </Row>
      </Section>
      {editing && (
        <ShortcutDialog
          name={editing}
          current={editing === "translate" ? settings.translateShortcut : settings.captureShortcut}
          onClose={() => setEditing(null)}
          onSave={(shortcut) => {
            void patch(editing === "translate" ? { translateShortcut: shortcut } : { captureShortcut: shortcut });
            setEditing(null);
          }}
        />
      )}
    </>
  );
}

export function AccessibilityPage() {
  const { t } = useT();
  const { settings, patch } = useAppSettings();
  return (
    <>
      <Section>
        <Row title={t("acc.language")} description={t("acc.languageDesc")}>
          <Select
            label={t("acc.language")}
            value={settings.uiLanguage}
            onChange={(v) => void patch({ uiLanguage: v })}
            options={[
              { value: "system", label: t("acc.system") },
              { value: "en", label: "English" },
              { value: "de", label: "Deutsch" },
            ]}
          />
        </Row>
      </Section>
      <Section title={t("acc.theme")}>
        <div className="dw-row">
          <RadioGroup
            name="theme"
            value={settings.theme}
            onChange={(v) => void patch({ theme: v })}
            options={[
              { value: "light", label: t("acc.themeLight") },
              { value: "dark", label: t("acc.themeDark") },
              { value: "system", label: t("acc.themeSystem") },
            ]}
          />
        </div>
      </Section>
    </>
  );
}

export function FilesPage() {
  const { t } = useT();
  const { settings, patch } = useAppSettings();
  const soon = useSoon();
  return (
    <>
      <Section title={t("files.download")}>
        <div className="dw-row">
          <RadioGroup
            name="download"
            disabled
            value={settings.downloadLocation === "ask" ? "ask" : "folder"}
            onChange={() => {}}
            options={[
              { value: "ask", label: t("files.downloadAsk") },
              { value: "folder", label: t("files.downloadFolder") },
            ]}
          />
          {soon}
        </div>
      </Section>
      <Section title={t("files.history")}>
        <Row title={t("files.keepHistory")} description={t("files.keepHistoryDesc")}>
          <Switch
            label={t("files.keepHistory")}
            checked={settings.keepHistory}
            onChange={(v) => void patch({ keepHistory: v })}
          />
        </Row>
      </Section>
      <Section>
        <CaptureLanguages />
      </Section>
    </>
  );
}

export { PacksPage } from "./PacksPage";

function BlockAdd({ onAdd }: { onAdd: (app: string) => void }) {
  const { t } = useT();
  const [value, setValue] = useState("");
  const add = () => {
    if (!value.trim()) return;
    onAdd(value.trim());
    setValue("");
  };
  return (
    <div className="blockadd">
      <input
        className="dw-input"
        aria-label={t("adv.block")}
        placeholder={t("adv.blockPlaceholder")}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && add()}
      />
      <Button onClick={add} disabled={!value.trim()}>
        {t("adv.blockAdd")}
      </Button>
    </div>
  );
}

export function AdvancedPage() {
  const { t } = useT();
  const { settings, patch } = useAppSettings();
  const [confirm, setConfirm] = useState(false);
  const cores = navigator.hardwareConcurrency || 4;
  const autoThreads = Math.max(2, Math.floor((cores * 2) / 3));
  return (
    <>
      <Section>
        <div className="dw-row">
          <div className="dw-row__text">
            <div className="dw-row__title">{t("adv.block")}</div>
            <div className="dw-row__desc">{t("adv.blockDesc")}</div>
            <div className="row-extra">
              {settings.blockList.length === 0 && <p className="note">{t("adv.blockEmpty")}</p>}
              <ul className="blocklist">
                {settings.blockList.map((app) => (
                  <li key={app}>
                    <code>{app}</code>
                    <IconButton
                      icon="close"
                      label={t("adv.blockRemove", { app })}
                      onClick={() => void patch({ blockList: settings.blockList.filter((a) => a !== app) })}
                    />
                  </li>
                ))}
              </ul>
              <BlockAdd onAdd={(app) => void patch({ blockList: [...settings.blockList, app] })} />
              <p className="note">{t("adv.blockTip")}</p>
            </div>
          </div>
        </div>
        <Row title={t("adv.proxy")} description={t("adv.proxyDesc")}>
          <Switch label={t("adv.proxy")} checked={settings.proxyEnabled} onChange={(v) => void patch({ proxyEnabled: v })} />
        </Row>
        {settings.proxyEnabled && (
          <Row title={t("adv.proxyUrl")} description={t("adv.proxyUrlDesc")}>
            <input
              className="dw-input"
              aria-label={t("adv.proxyUrl")}
              placeholder="http://host:8080"
              defaultValue={settings.proxyUrl}
              onBlur={(e) => void patch({ proxyUrl: e.target.value.trim() })}
              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            />
          </Row>
        )}
      </Section>
      <Section title={t("adv.performance")}>
        <Row title={t("adv.twoPass")} description={t("adv.twoPassDesc")}>
          <Switch label={t("adv.twoPass")} checked={settings.twoPass} onChange={(v) => void patch({ twoPass: v })} />
        </Row>
        <Row title={t("adv.threads")} description={t("adv.threadsDesc")}>
          <Select
            label={t("adv.threads")}
            value={String(settings.translationThreads)}
            onChange={(v) => void patch({ translationThreads: Number(v) })}
            options={[
              { value: "0", label: t("adv.threadsAuto", { count: autoThreads }) },
              ...Array.from({ length: cores }, (_, i) => ({ value: String(i + 1), label: t("adv.threadsN", { count: i + 1 }) })),
            ]}
          />
        </Row>
      </Section>
      <Section title={t("adv.defaults")}>
        <Row title={t("adv.reset")} description={t("adv.resetDesc")}>
          <Button variant="danger" onClick={() => setConfirm(true)}>
            {t("common.reset")}
          </Button>
        </Row>
      </Section>
      <Dialog
        open={confirm}
        title={t("adv.resetConfirmTitle")}
        onClose={() => setConfirm(false)}
        footer={
          <>
            <Button onClick={() => setConfirm(false)}>{t("common.cancel")}</Button>
            <Button
              variant="primary"
              onClick={() => {
                void settingsStore.patch(defaultSettings);
                setConfirm(false);
              }}
            >
              {t("common.reset")}
            </Button>
          </>
        }
      >
        <p>{t("adv.resetConfirmBody")}</p>
      </Dialog>
    </>
  );
}
