import { Chip, EmptyState, type IconName } from "@seconddawn/ui";
import { useT } from "../i18n";
import type { Key } from "../locales/en";

export function ComingSoon(props: { icon: IconName; title: string; description: Key }) {
  const { t } = useT();
  return (
    <div className="card-center">
      <EmptyState icon={props.icon} title={props.title} action={<Chip tone="brand">{t("soon.badge")}</Chip>}>
        {t(props.description)}
      </EmptyState>
    </div>
  );
}
