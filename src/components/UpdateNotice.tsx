import { Button, Icon } from "@seconddawn/ui";
import { useT } from "../i18n";
import { dismissUpdate, installUpdate, useUpdateState } from "../updater";

/**
 * A small, non-blocking notice in the corner: a newer version exists (with its notes), or the result of
 * a manual check. It never covers the translation panes and never interrupts typing.
 */
export function UpdateNotice() {
  const { t } = useT();
  const state = useUpdateState();
  if (state.kind === "idle" || state.kind === "checking") return null;

  if (state.kind === "available" || state.kind === "installing") {
    const installing = state.kind === "installing";
    const info = state.kind === "available" ? state.info : null;
    return (
      <aside className="update-notice" role="status" aria-live="polite">
        <div className="update-notice__head">
          <Icon name="download" size={18} />
          <strong>{info ? t("update.available", { version: info.version }) : t("update.installing")}</strong>
        </div>
        {info?.notes && <p className="update-notice__notes">{info.notes}</p>}
        {info && (
          <div className="update-notice__actions">
            <Button variant="primary" onClick={() => void installUpdate()}>
              {t("update.install")}
            </Button>
            <Button variant="ghost" onClick={dismissUpdate}>
              {t("update.later")}
            </Button>
          </div>
        )}
        {installing && <p className="update-notice__notes">{t("update.installingHint")}</p>}
      </aside>
    );
  }

  const text = state.kind === "uptodate" ? t("update.uptodate") : t("update.error");
  return (
    <aside className="update-notice update-notice--brief" role="status" aria-live="polite">
      <Icon name={state.kind === "uptodate" ? "check" : "alert"} size={18} />
      <span>{text}</span>
      <Button variant="ghost" onClick={dismissUpdate}>
        {t("common.close")}
      </Button>
    </aside>
  );
}
