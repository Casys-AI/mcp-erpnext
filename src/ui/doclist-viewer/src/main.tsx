/** @jsxImportSource preact */
import { render } from "preact";
import "~/global.css";
import { applyCasysTheme, themeFromSearch } from "~/shared/casys-theme";
import { DoclistViewer } from "./DoclistViewer";

applyCasysTheme(themeFromSearch());
render(<DoclistViewer />, document.getElementById("app")!);
