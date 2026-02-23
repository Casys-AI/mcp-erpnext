import { createRoot } from "react-dom/client";
import "~/global.css";
import { KpiViewer } from "./KpiViewer";

createRoot(document.getElementById("app")!).render(<KpiViewer />);
