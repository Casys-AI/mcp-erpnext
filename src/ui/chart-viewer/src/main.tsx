/** @jsxImportSource preact */
import { render } from "preact";
import "~/global.css";
import { applyCasysTheme, themeFromSearch } from "~/shared/casys-theme";
import { ChartViewer } from "./ChartViewer";

applyCasysTheme(themeFromSearch());
render(<ChartViewer />, document.getElementById("app")!);
