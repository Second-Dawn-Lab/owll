import { Icon, Popover } from "@seconddawn/ui";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { languageName, useT } from "../i18n";
import type { LanguageInfo } from "../ipc";
import { placeDropdown } from "./dropdownPlacement";

interface Props {
  value: string;
  onChange: (code: string) => void;
  languages: LanguageInfo[];
  /** Offer "Detect language" (source picker only). */
  allowAuto?: boolean;
  /** Language guessed for the current text, shown as "(detected)". */
  detected?: string | null;
  label: string;
}

export function LanguagePicker({ value, onChange, languages, allowAuto, detected, label }: Props) {
  const { t, locale } = useT();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const items = languages
      .map((l) => ({ ...l, name: languageName(l.code, locale, l.name) }))
      .filter((l) => !q || l.name.toLowerCase().includes(q) || l.code.includes(q))
      .sort((a, b) => a.name.localeCompare(b.name, locale));
    return {
      auto: allowAuto && (!q || t("lang.auto").toLowerCase().includes(q)),
      installed: items.filter((l) => l.installed),
      download: items.filter((l) => !l.installed),
    };
  }, [languages, query, locale, allowAuto, t]);

  // Keep the list inside the window: the quick popup can be smaller than the list, and a window clips it.
  useLayoutEffect(() => {
    if (!open) return;
    const fit = () => {
      const panel = panelRef.current;
      const popover = panel?.parentElement;
      const list = panel?.querySelector<HTMLElement>(".picker__list");
      const search = panel?.querySelector<HTMLElement>(".picker__search");
      const trigger = popover?.parentElement;
      if (!panel || !popover || !list || !search || !trigger) return;
      // Measure the natural size first, then apply the placement.
      panel.style.width = "";
      list.style.maxHeight = "";
      popover.style.transform = "";
      popover.style.top = "";
      popover.style.bottom = "";
      const placement = placeDropdown({
        trigger: trigger.getBoundingClientRect(),
        viewport: { width: window.innerWidth, height: window.innerHeight },
        width: panel.offsetWidth,
        chromeHeight: search.offsetHeight,
        listHeight: list.scrollHeight,
      });
      panel.style.width = `${placement.width}px`;
      list.style.maxHeight = `${placement.listMaxHeight}px`;
      popover.style.transform = `translateX(calc(-50% + ${placement.shiftX}px))`;
      if (placement.flipUp) {
        popover.style.top = "auto";
        popover.style.bottom = "calc(100% + 6px)";
      }
    };
    fit();
    // Focus only now that the list is in place, and without scrolling: focusing it unplaced would scroll the
    // clipped popup sideways to reveal the list and push the trigger out of view.
    panelRef.current?.querySelector("input")?.focus({ preventScroll: true });
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [open, groups]);

  const choose = (code: string) => {
    onChange(code);
    setOpen(false);
    setQuery("");
  };
  const close = () => {
    setOpen(false);
    setQuery("");
  };
  const firstMatch = groups.auto ? "auto" : (groups.installed[0] ?? groups.download[0])?.code;

  const buttonText =
    value === "auto"
      ? detected
        ? t("lang.detected", { lang: languageName(detected, locale) })
        : t("lang.auto")
      : languageName(value, locale, languages.find((l) => l.code === value)?.name);

  const item = (code: string, name: string, badge?: boolean, beta?: boolean) => (
    <li key={code}>
      <button type="button" className="picker__item" onClick={() => choose(code)}>
        <span className="picker__check">{code === value && <Icon name="check" size={15} />}</span>
        <span className="picker__name">{name}</span>
        {beta && (
          <span className="picker__beta" title={t("lang.betaHint")}>
            {t("lang.beta")}
          </span>
        )}
        {badge && (
          <span className="picker__badge">
            <Icon name="download" size={12} />
            {t("packs.download")}
          </span>
        )}
      </button>
    </li>
  );

  return (
    <Popover
      open={open}
      onClose={close}
      align="center"
      trigger={
        <button
          type="button"
          className="picker__trigger"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={label}
          onClick={() => setOpen((o) => !o)}
        >
          <span>{buttonText}</span>
          <Icon name="chevron" size={15} />
        </button>
      }
    >
      <div className="picker" ref={panelRef}>
        <div className="picker__search">
          <Icon name="search" size={15} />
          <input
            value={query}
            placeholder={t("lang.search")}
            aria-label={t("lang.search")}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && firstMatch && choose(firstMatch)}
          />
        </div>
        <div className="picker__list">
          {groups.auto && <ul>{item("auto", t("lang.auto"))}</ul>}
          {groups.installed.length > 0 && (
            <>
              <div className="picker__group">{t("lang.installed")}</div>
              <ul>{groups.installed.map((l) => item(l.code, l.name, false, l.beta))}</ul>
            </>
          )}
          {groups.download.length > 0 && (
            <>
              <div className="picker__group">{t("lang.download")}</div>
              <ul>{groups.download.map((l) => item(l.code, l.name, true, l.beta))}</ul>
            </>
          )}
          {!groups.auto && groups.installed.length + groups.download.length === 0 && (
            <div className="picker__none">{t("lang.noMatch")}</div>
          )}
        </div>
      </div>
    </Popover>
  );
}
