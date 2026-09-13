/** @jsxImportSource preact */
import { render } from "preact";
import "~/global.css";
import { applyCasysTheme, themeFromSearch } from "~/shared/casys-theme";
import { mergeHostContext } from "~/shared/host-context.ts";
import { isFixtureMode } from "./fixture.ts";
import { DocViewer } from "./DocViewer.tsx";

if (isFixtureMode()) {
  mergeHostContext({
    locale: new URLSearchParams(location.search).get("locale") ?? "en",
  });
}
applyCasysTheme(themeFromSearch());
render(<DocViewer />, document.getElementById("app")!);
