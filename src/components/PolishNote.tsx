import { Button, Icon } from "@seconddawn/ui";
import { useT } from "../i18n";
import { ipc } from "../ipc";

/** Quality mode could not polish a translation: a visible note with the reason, what to do, and a retry. */
export function PolishNote({ code, message, onRetry }: { code: string | null; message: string | null; onRetry: () => void }) {
  const { t } = useT();
  const memory = code === "quality_low_memory";
  const needsSetup = code === "quality_unavailable" || code === "quality_unsupported_language";
  return (
    <div className="polishnote" role="status">
      <Icon name="alert" size={14} />
      <span className="polishnote__text">
        {t("quality.polishNote")} {message}
        {memory && ` ${t("quality.polishNoteMemory")}`}
      </span>
      {needsSetup ? (
        <Button variant="ghost" onClick={() => void ipc.openSettings("quality")}>
          {t("quality.openSettings")}
        </Button>
      ) : (
        <Button variant="ghost" onClick={onRetry}>
          {t("quality.retry")}
        </Button>
      )}
    </div>
  );
}
