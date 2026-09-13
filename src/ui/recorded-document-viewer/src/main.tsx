/** @jsxImportSource preact */

import "~/global.css";
import { applyCasysTheme, themeFromSearch } from "~/shared/casys-theme.ts";
import { renderStartupFailure, startRecordedDocumentApp } from "./app.ts";
import { RECORDED_COMPONENT_REGISTRY } from "./components.tsx";

applyCasysTheme(themeFromSearch());

const root = document.getElementById("root");
if (!root) throw new Error("The recorded document viewer root is missing.");

void startRecordedDocumentApp(root, RECORDED_COMPONENT_REGISTRY).catch(
  (error) => {
    root.replaceChildren(renderStartupFailure(error));
    root.setAttribute("aria-busy", "false");
    console.error(error);
  },
);
