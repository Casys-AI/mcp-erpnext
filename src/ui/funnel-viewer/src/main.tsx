import { createRoot } from "react-dom/client";
import "~/global.css";
import { FunnelViewer } from "./FunnelViewer";

createRoot(document.getElementById("app")!).render(<FunnelViewer />);
