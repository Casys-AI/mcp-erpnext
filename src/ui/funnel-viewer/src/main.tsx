/** @jsxImportSource preact */
import { render } from "preact";
import "~/global.css";
import { applyCasysTheme, themeFromSearch } from "~/shared/casys-theme";
import { FunnelViewer } from "./FunnelViewer";

applyCasysTheme(themeFromSearch());
render(<FunnelViewer />, document.getElementById("app")!);
