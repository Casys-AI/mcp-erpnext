/** @jsxImportSource preact */
import { render } from "preact";
import "~/global.css";
import { applyCasysTheme, themeFromSearch } from "~/shared/casys-theme";
import { DocViewer } from "./DocViewer.tsx";

applyCasysTheme(themeFromSearch());
render(<DocViewer />, document.getElementById("app")!);
