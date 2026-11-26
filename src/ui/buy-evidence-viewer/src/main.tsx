/** @jsxImportSource preact */

import "~/global.css";
import { applyCasysTheme, themeFromSearch } from "~/shared/casys-theme.ts";
import { renderStartupFailure, startBuyEvidenceApp } from "./app.ts";

applyCasysTheme(themeFromSearch());

const root = document.getElementById("root");
if (!root) throw new Error("The Buy evidence viewer root is missing.");

void startBuyEvidenceApp(root).catch((error) => {
  root.replaceChildren(renderStartupFailure(error));
  root.setAttribute("aria-busy", "false");
  console.error(error);
});
