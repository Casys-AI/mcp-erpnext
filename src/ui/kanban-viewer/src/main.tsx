/** @jsxImportSource preact */
import { render } from "preact";
import "~/global.css";
import "./kanban.css";
import { applyCasysTheme, themeFromSearch } from "~/shared/casys-theme";
import { KanbanViewer } from "./KanbanViewer";

applyCasysTheme(themeFromSearch());
render(<KanbanViewer />, document.getElementById("app")!);
