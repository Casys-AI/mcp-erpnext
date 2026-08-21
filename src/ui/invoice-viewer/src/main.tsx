/** @jsxImportSource preact */
import { render } from "preact";
import "~/global.css";
import { applyCasysTheme, themeFromSearch } from "~/shared/casys-theme";
import { InvoiceViewer } from "./InvoiceViewer";

applyCasysTheme(themeFromSearch());
render(<InvoiceViewer />, document.getElementById("app")!);
