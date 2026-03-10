import { createRoot } from "react-dom/client";
import "~/global.css";
import { KanbanViewer } from "./KanbanViewer";

createRoot(document.getElementById("app")!).render(<KanbanViewer />);
