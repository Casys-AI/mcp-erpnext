import { createRoot } from "react-dom/client";
import "~/global.css";
import { OrderPipelineViewer } from "./OrderPipelineViewer";

createRoot(document.getElementById("app")!).render(<OrderPipelineViewer />);
