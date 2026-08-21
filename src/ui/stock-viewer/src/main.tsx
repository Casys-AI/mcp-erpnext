/** @jsxImportSource preact */
import { render } from "preact";
import "~/global.css";
import { applyCasysTheme, themeFromSearch } from "~/shared/casys-theme";
import { StockViewer } from "./StockViewer";

applyCasysTheme(themeFromSearch());
render(<StockViewer />, document.getElementById("app")!);
