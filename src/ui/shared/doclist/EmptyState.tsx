/** @jsxImportSource preact */
import { StateMessage } from "~/shared/ui";
import { useT } from "~/shared/i18n-hook";

export function DoclistEmptyState() {
  const t = useT();
  return (
    <StateMessage>
      {t("doclist.empty.message")}
    </StateMessage>
  );
}
