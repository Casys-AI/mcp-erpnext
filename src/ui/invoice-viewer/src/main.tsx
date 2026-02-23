import { createRoot } from "react-dom/client";
import "~/global.css";
import { InvoiceViewer } from "./InvoiceViewer";

createRoot(document.getElementById("app")!).render(<InvoiceViewer />);
