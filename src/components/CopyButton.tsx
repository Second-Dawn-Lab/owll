import { IconButton } from "@seconddawn/ui";
import { useEffect, useState } from "react";
import { useT } from "../i18n";

export function CopyButton({ text }: { text: string }) {
  const { t } = useT();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1200);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      /* clipboard unavailable: nothing to do */
    }
  };

  return (
    <IconButton
      icon={copied ? "check" : "copy"}
      label={copied ? t("action.copied") : t("action.copy")}
      disabled={!text}
      onClick={() => void copy()}
    />
  );
}
