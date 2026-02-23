import { createRoot } from "react-dom/client";
import "~/global.css";
import { ChartViewer } from "./ChartViewer";

createRoot(document.getElementById("app")!).render(<ChartViewer />);
