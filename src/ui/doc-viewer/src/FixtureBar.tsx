/** @jsxImportSource preact */
import { useT } from "~/shared/i18n-hook.ts";
import { OPERATIONAL_FIXTURES } from "./operational-fixtures.ts";
export function FixtureBar() {
  const t = useT();
  return (
    <div class="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-line bg-sunken px-3 py-2">
      <span class="font-mono text-chip text-ink-muted">
        {t("dossier.fixture")}
      </span>
      <select
        aria-label={t("dossier.fixture_select")}
        class="min-h-9 min-w-0 rounded-control border border-line bg-surface px-2 font-mono text-chip text-ink focus-visible:outline-2 focus-visible:outline-accent"
        value={new URLSearchParams(location.search).get("fixture") ?? "1"}
        onChange={(event) => {
          const url = new URL(location.href);
          url.searchParams.set("fixture", event.currentTarget.value);
          location.assign(url.href);
        }}
      >
        <option value="1">Task · legacy fixture</option>
        {Object.entries(OPERATIONAL_FIXTURES).map(([key, fixture]) => (
          <option key={key} value={key}>{String(fixture.data.doctype)}</option>
        ))}
      </select>
    </div>
  );
}
