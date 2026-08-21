/** @jsxImportSource preact */
import { render } from "preact";
import "~/global.css";
import { applyCasysTheme, themeFromSearch } from "~/shared/casys-theme";
import { KpiViewer } from "./KpiViewer";

applyCasysTheme(themeFromSearch());
render(<KpiViewer />, document.getElementById("app")!);
