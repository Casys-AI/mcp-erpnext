# Visual assets

Screenshots and GIFs used in the project README and docs. Keep them here so the
repo root stays clean and the README references stable paths.

## Capture checklist

The project's selling point is its interactive UI viewers — the README should
**show** them. Drop the following files in this folder:

| File                 | What to capture                                                      | Used in                      |
| -------------------- | -------------------------------------------------------------------- | ---------------------------- |
| `demo.gif`           | A short (5–10 s) drill-down: list → row click → detail → cross-nav   | README top (`<!-- demo -->`) |
| `doclist-viewer.png` | Generic document table with chip filters + an expanded inline detail | UI Viewers table             |
| `invoice-viewer.png` | A Sales/Purchase Invoice with parties, items, totals, action buttons | UI Viewers table             |
| `stock-viewer.png`   | Stock balance table with color-coded qty badges                      | UI Viewers table             |
| `chart-viewer.png`   | One representative chart (e.g. revenue trend or sales bar)           | UI Viewers table             |
| `kanban-viewer.png`  | A board (Task/Opportunity/Issue) with a few columns and cards        | UI Viewers table             |
| `kpi-viewer.png`     | A KPI card with delta + sparkline                                    | UI Viewers table             |
| `funnel-viewer.png`  | The trapezoid sales funnel with conversion badges                    | UI Viewers table             |

### Tips for clean captures

- Use a real or seeded ERPNext instance so numbers look plausible (not empty
  states).
- Capture at 2× / retina, then downscale — crisper on GitHub.
- Crop tightly to the viewer; hide unrelated chat chrome.
- Keep `demo.gif` under ~5 MB (GitHub renders inline). Tools: `gifski`, `peek`,
  or QuickTime → `ffmpeg`.
- PNGs: aim for ~1200 px wide max; run through `pngquant`/`oxipng` to shrink.

Once the files are here, the README placeholders will be wired to point at them.
