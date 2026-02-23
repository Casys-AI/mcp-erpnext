import { createRoot } from "react-dom/client";
import "~/global.css";
import { DoclistViewer } from "./DoclistViewer";

createRoot(document.getElementById("app")!).render(<DoclistViewer />);
