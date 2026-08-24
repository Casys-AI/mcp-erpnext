[English](README.md) | 繁體中文

# @casys/mcp-erpnext

[![JSR](https://jsr.io/badges/@casys/mcp-erpnext)](https://jsr.io/@casys/mcp-erpnext)
[![npm](https://img.shields.io/npm/v/@casys/mcp-erpnext?logo=npm&color=cb3837)](https://www.npmjs.com/package/@casys/mcp-erpnext)
[![CI](https://github.com/Casys-AI/mcp-erpnext/actions/workflows/test.yml/badge.svg)](https://github.com/Casys-AI/mcp-erpnext/actions/workflows/test.yml)
[![MCP](https://img.shields.io/badge/MCP-server-1f6feb?logo=modelcontextprotocol&logoColor=white)](https://modelcontextprotocol.io)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

> [!IMPORTANT]
> **安裝 3.1 Beta：** 在新版 UX 驗證期間，請固定使用預發布版本。npm/Node 請執行
> `npx -y @casys/mcp-erpnext@3.1.0-beta.2`；Deno 請執行
> `deno run -A jsr:@casys/mcp-erpnext@3.1.0-beta.2/server`。npm 的浮動標籤為
> `@next`。Beta 2 新增通用文件檢視器及附件流程；在取代穩定版部署前，請務必
> 使用實際的 MCP 主機進行測試。

讓任何相容 MCP 的 AI 智慧代理操作您的 [ERPNext](https://erpnext.com) / Frappe
執行個體 — 文件、工作流程，以及主機內的互動式檢視器（Claude Desktop、 Claude
Code、VS Code Copilot 或自訂代理）。

支援**自行託管**與 **ERPNext Cloud**（frappe.cloud）執行個體。

> 基於 **[@casys/mcp-server](https://github.com/Casys-AI/mcp-server)** 構建 —
> 這是驅動本專案的 MCP 伺服器框架（並行處理、驗證、MCP Apps、可觀測性）。

## 截圖

在 MCP 主機中渲染的互動式檢視器，完全由工具結果驅動。

<table>
  <tr>
    <td width="50%" align="center">
      <img src="docs/assets/doclist-viewer.png" alt="Document list viewer with chip filters and inline detail" width="100%"><br>
      <sub><b>doclist-viewer</b> — 任何 DocType 皆可呈現為可排序的表格，含晶片篩選器及內嵌詳細面板</sub>
    </td>
    <td width="50%" align="center">
      <img src="docs/assets/invoice-viewer.png" alt="Invoice viewer with line items and actions" width="100%"><br>
      <sub><b>invoice-viewer</b> — 顯示交易方、明細項目、品項下鑽及提交／取消／付款功能的發票檢視器</sub>
    </td>
  </tr>
  <tr>
    <td width="50%" align="center">
      <img src="docs/assets/funnel-viewer.png" alt="Sales funnel viewer" width="100%"><br>
      <sub><b>funnel-viewer</b> — 潛在客戶 → 商機 → 報價 → 訂單，含轉換率</sub>
    </td>
    <td width="50%" align="center">
      <img src="docs/assets/kpi-viewer.png" alt="KPI viewer with sparkline" width="100%"><br>
      <sub><b>kpi-viewer</b> — 大數字 KPI，含與上期對比的差異值及走勢迷你圖</sub>
    </td>
  </tr>
  <tr>
    <td width="50%" align="center">
      <img src="docs/assets/chart-viewer.png" alt="Chart viewer" width="100%"><br>
      <sub><b>chart-viewer</b> — 通用 Recharts 渲染器（範例：庫存水位）</sub>
    </td>
    <td width="50%" align="center">
      <img src="docs/assets/stock-viewer.png" alt="Stock balance viewer" width="100%"><br>
      <sub><b>stock-viewer</b> — 庫存結餘，含色碼數量標籤</sub>
    </td>
  </tr>
  <tr>
    <td width="50%" align="center">
      <img src="docs/assets/kanban-viewer.png" alt="Read-write kanban board" width="100%"><br>
      <sub><b>kanban-viewer</b> — 可讀寫的看板（Task / Opportunity / Issue），含內嵌編輯</sub>
    </td>
    <td width="50%" align="center">
      <img src="docs/assets/profit-loss.png" alt="Profit and loss composed chart" width="100%"><br>
      <sub><b>chart-viewer</b> — 複合雙軸圖表（範例：損益表）</sub>
    </td>
  </tr>
</table>

## 最新異動

完整的發布歷程請參閱
[CHANGELOG](CHANGELOG.md)，目前版本的重點說明請參閱[最新發布](https://github.com/Casys-AI/mcp-erpnext/releases/latest)。

> **3.1 Beta 2 預覽版：** 此版本維持與 3.0 工具介面的相容性，並新增通用文件
> 檢視器、子表格、附件、檢視器內導覽及作用中內容。所有功能仍依 MCP 主機能力
> 啟用；下載同時需要代理伺服器工具與 MCP Apps 的 `downloadFile` 能力。

## 文件

依照 [Diátaxis](https://diataxis.fr) 依「你正在做什麼」分類：

|                       |                                                                                                                                                                                             |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **學習** — 第一次接觸 | [第一次工具呼叫](docs/tutorial-first-tool-call.md) — 四個步驟，從零到看見回應                                                                                                               |
| **執行** — 有明確目標 | [建立主檔資料](docs/fresh-instance-setup.md) · [執行 HTTP 伺服器](docs/http-deployment.md) · [設定 OAuth](docs/oauth-setup.md) · [遷移至 2026-07-28](docs/migration-mcp-spec-2026-07-28.md) |
| **查閱**              | [工具](docs/tools.md) · [環境變數](docs/environment-variables.md) · [DocType 涵蓋範圍](docs/coverage.md) · [儲存庫結構](docs/architecture.md)                                               |
| **理解原理**          | [設計概念](docs/concepts.md) — 連結解析、傳輸方式、MRTR，以及各層快取的差異                                                                                                                 |

## 快速開始

### 前置條件

在 ERPNext 中產生 API 憑證：

1. 登入 ERPNext → 右上角選單 → **My Settings**
2. **API Access** 區段 → **Generate Keys**
3. 複製 `API Key` 與 `API Secret`

### Claude Desktop / Claude Code（npm）

```json
{
  "mcpServers": {
    "erpnext": {
      "command": "npx",
      "args": ["-y", "@casys/mcp-erpnext"],
      "env": {
        "ERPNEXT_URL": "http://localhost:8000",
        "ERPNEXT_API_KEY": "your-api-key",
        "ERPNEXT_API_SECRET": "your-api-secret"
      }
    }
  }
}
```

> **支援 ERPNext Cloud** — 將 `ERPNEXT_URL` 設定為您的 Frappe Cloud URL（例如
> `https://mycompany.erpnext.com` 或 `https://mysite.frappe.cloud`）。API
> 金鑰驗證在自行託管與雲端執行個體上的操作方式相同。

### VS Code Copilot

新增至 `.vscode/mcp.json`：

```json
{
  "servers": {
    "erpnext": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@casys/mcp-erpnext"],
      "env": {
        "ERPNEXT_URL": "http://localhost:8000",
        "ERPNEXT_API_KEY": "your-api-key",
        "ERPNEXT_API_SECRET": "your-api-secret"
      }
    }
  }
}
```

### Deno（stdio）

```json
{
  "mcpServers": {
    "erpnext": {
      "command": "deno",
      "args": ["run", "--allow-all", "server.ts"],
      "env": {
        "ERPNEXT_URL": "http://localhost:8000",
        "ERPNEXT_API_KEY": "your-api-key",
        "ERPNEXT_API_SECRET": "your-api-secret"
      }
    }
  }
}
```

### HTTP 模式

若需要多個用戶端共用一個常駐伺服器，而非每個用戶端各自啟動一個行程：
[如何執行 HTTP 伺服器](docs/http-deployment.md)。 請注意，3.0.0 對 2026 年前的
HTTP 用戶端屬於破壞性變更。

### 類別篩選

僅載入您所需的類別：

```bash
npx -y @casys/mcp-erpnext --categories=sales,inventory
```

## 全新執行個體設定

全新的 ERPNext 執行個體沒有主檔資料，因此業務工具會因驗證失敗而無法使用。
請見[為全新 ERPNext 執行個體建立主檔資料](docs/fresh-instance-setup.md)。

## UI 檢視器

八個互動式 [MCP Apps](https://github.com/modelcontextprotocol/ext-apps)
檢視器，已登錄為 `ui://mcp-erpnext/{name}`：

| 檢視器           | 說明                                               | 互動功能                                                       |
| ---------------- | -------------------------------------------------- | -------------------------------------------------------------- |
| `doc-viewer`     | 顯示欄位與子表格的通用 ERPNext 文件                | 依能力啟用附件、具型別導覽、受保護的提交／取消及原始 JSON。    |
| `doclist-viewer` | 通用文件表格，支援排序、篩選、分頁與 CSV 匯出      | 內嵌詳情、具型別的巢狀導覽、提交／取消，以及精簡的狀態篩選器。 |
| `invoice-viewer` | 含交易方、品項及合計的銷售訂單、銷售發票與報價單   | 品項、庫存、交易方與付款導覽，以及受保護的提交／取消操作。     |
| `stock-viewer`   | 含色碼數量標籤的庫存結餘表格                       | 品項詳情、近期異動、庫存圖表與庫存記錄導覽。                   |
| `chart-viewer`   | 通用圖表渲染器（透過 Recharts 支援 12 種圖表類型） | 精確的資料點／數列導覽，以及簡單與組合圖表的作用中內容選取。   |
| `kanban-viewer`  | 可讀寫的 Task、Opportunity、Issue 看板             | 拖放、內嵌編輯、循序儲存，以及具型別的相關文件導覽。           |
| `kpi-viewer`     | 含差異值、迷你圖與趨勢的大數字卡片                 | 數值與趨勢導覽，以及有上限的作用中內容選取。                   |
| `funnel-viewer`  | 含轉換率的梯形銷售漏斗                             | 保留期間條件的階段導覽，以及有上限的作用中內容選取。           |

### 導覽與作用中內容

檢視器會依主機宣告的能力，逐步採用最合適的互動方式：

- `serverTools` 透過 `app.callServerTool()`，直接在目前檢視器內開啟具型別的
  清單、文件或圖表層級。麵包屑與返回導覽會還原各層級的介面狀態。
- `downloadFile` 讓主機確認並儲存以大小上限保護的內嵌附件。檢視器不會直接開啟
  ERPNext 的檔案 URL。
- `updateModelContext` 可將圖表、KPI 與漏斗中的選取項目加入有上限的作用中內容。
  精簡的內容晶片最多保留八個項目，並可逐項移除或全部清除。傳送的快照只包含
  使用者選取的值，不含給模型的隱藏指令。
- 無法直接導覽或更新內容時，`message.text` 會保留 `app.sendMessage()` 作為
  對話式後備方式。
- 主機未提供上述能力時，仍可使用本機檢視功能，不支援的遠端操作則不會顯示。

伺服器會提供具型別的導覽後設資料，以及各檢視器實際可呼叫的
`_availableTools`，因此在類別篩選的部署中不會顯示未載入的工具。

### 重新整理模式

唯讀檢視器會在重新取得焦點或使用重新整理控制項時重新驗證。資料異動後只會
透過明確的唯讀工具讀回已提交狀態，不會自動重播寫入工具。若較新的主機資料或
異動結果已生效，較舊或重疊的重新整理回應會被忽略。
已確認的文件異動會把目前導覽堆疊中可能衍生的快照標記為過期；只有在該畫面
實際重新讀取後才會移除標記。Beta 2 不會自動同步彼此分離的 MCP Apps。

### 建置 UI 檢視器

```bash
cd src/ui
npm ci
node build-all.mjs
```

## 工具

資料列表類的 `_list` 工具會透過 doclist-viewer 返回互動式結果，支援點擊列、
內嵌詳情及跨檢視器導覽；專用於附件的 `erpnext_file_list` 不會呈現
doclist-viewer。通用與專用的文件讀取會使用 doc-viewer，但銷售訂單、銷售發票及
報價單仍保留專用的 invoice-viewer。

- **Sales（銷售）** — 客戶、銷售訂單、發票及報價單，含完整的 CRUD、提交與取消。
- **Purchasing（採購）** — 供應商、採購訂單、採購發票、收貨單及供應商報價單。
- **Inventory（庫存）** — 品項、庫存結餘、倉庫及庫存記錄。
- **Accounting（會計）** — 科目表、日記帳分錄及付款記錄。
- **HR（人資）** — 員工、出勤、請假申請、薪資單、薪資處理及費用申報。
- **Project（專案）** — 專案、任務（含原生指派）及工時單。
- **Delivery（出貨）** — 出貨單及貨運單。
- **Manufacturing（製造）** — 物料清單（BOM）、工單及工作卡。
- **CRM** — 潛在客戶、商機、聯絡人及行銷活動。
- **Assets（資產）** — 資產、異動、維護紀錄及類別。
- **Operations（作業）** — 任何 DocType 的通用 CRUD、原生指派，以及附件清單、
  上傳或由主機代理下載（`erpnext_doc_*`、`erpnext_file_*`）。
- **Kanban（看板）** — 支援拖放的 Task、Opportunity、Issue 可讀寫看板。
- **Analytics（分析）** — 圖表（長條圖、面積圖、樹狀圖、雷達圖、散佈圖、損益表
  等）、含迷你圖的 KPI，以及銷售漏斗。
- **Setup（設定）** — 公司建立及可指派使用者清單。

完整的各工具參數說明請參閱 [`docs/tools.md`](docs/tools.md)。

## 環境變數

| 變數                         | 必填 | 說明                                                                                                      |
| ---------------------------- | ---- | --------------------------------------------------------------------------------------------------------- |
| `ERPNEXT_URL`                | 是   | ERPNext 基礎 URL — 自行託管（例如 `http://localhost:8000`）或雲端（例如 `https://mycompany.erpnext.com`） |
| `ERPNEXT_API_KEY`            | 是   | 來自使用者設定的 API Key                                                                                  |
| `ERPNEXT_API_SECRET`         | 是   | 來自使用者設定的 API Secret                                                                               |
| `ERPNEXT_MAX_UPLOAD_BYTES`   | 否   | 解碼後檔案上傳大小上限（正整數位元組；預設 10 MiB）                                                       |
| `ERPNEXT_MAX_DOWNLOAD_BYTES` | 否   | 附件下載大小上限（正整數位元組；預設 10 MiB）                                                             |
| `MCP_MRTR_SIGNING_KEY`       | 否   | 恰為 64 個小寫十六進位字元；啟用已簽章的模糊連結 elicitation。**僅限單一執行個體部署**，詳見下方說明      |

MRTR 為選用功能。未設定此金鑰，或用戶端未宣告 elicitation
時，模糊連結會維持既有的 可操作歧義錯誤，而不會要求選擇。

> **請勿在負載平衡器後方使用此設定執行 MRTR。** 簽章金鑰只證明重試權杖為真，
> 並不使其只能使用一次；後者是 replay store 的職責，而預設的 replay store
> 僅在單一行程內有效。若兩個執行個體共用金鑰，同一個已簽章的重試會在兩邊
> 都通過驗證，導致採購單、請假單或費用報銷單被**建立兩次**，且一經提交即
> 無法復原。
>
> 多執行個體部署必須將共用且具原子性的 `mrtr.replayStore` 傳入 `McpApp` （Redis
> 可用 `SET key 1 NX EXAT` 滿足此契約）。啟用 MRTR 而未提供時，
> 框架會在啟動時記錄警告——該警告並非雜訊，正是本段所述的問題。

## 架構

工具依業務領域分組於 `src/tools/`，Frappe REST 用戶端不含任何相依套件， 每個 UI
檢視器則是 `src/ui/` 下的獨立建置。完整結構請見
[儲存庫結構](docs/architecture.md)。

## npm 套件

npm 套件（`@casys/mcp-erpnext`）是一個完全自包含的套件，無任何執行時相依套件。UI
檢視器已內嵌其中。需要 Node >= 20。

## 貢獻

歡迎貢獻 — 請參閱 **[CONTRIBUTING.md](CONTRIBUTING.md)** 以開始，並參閱
[AGENTS.md](AGENTS.md) 了解完整的架構與慣例。

## 授權條款

MIT
