import { createRoot } from "react-dom/client";
import "~/global.css";
import { StockViewer } from "./StockViewer";

createRoot(document.getElementById("app")!).render(<StockViewer />);
