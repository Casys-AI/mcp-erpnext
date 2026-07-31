import { assert, assertEquals } from "@std/assert";

interface ViewerHandshakeFixture {
  directory: string;
  component: string;
  appName: string;
  handlers: string[];
}

const VIEWERS: ViewerHandshakeFixture[] = [
  {
    directory: "chart-viewer",
    component: "ChartViewer.tsx",
    appName: "Chart Viewer",
    handlers: ["ontoolresult", "ontoolinputpartial"],
  },
  {
    directory: "doclist-viewer",
    component: "DoclistViewer.tsx",
    appName: "Doclist Viewer",
    handlers: ["ontoolresult", "ontoolinputpartial"],
  },
  {
    directory: "funnel-viewer",
    component: "FunnelViewer.tsx",
    appName: "Funnel Viewer",
    handlers: ["ontoolresult", "ontoolinputpartial"],
  },
  {
    directory: "invoice-viewer",
    component: "InvoiceViewer.tsx",
    appName: "Invoice Viewer",
    handlers: ["ontoolresult", "ontoolinputpartial"],
  },
  {
    directory: "kanban-viewer",
    component: "KanbanViewer.tsx",
    appName: "Kanban Viewer",
    handlers: ["ontoolinput", "ontoolresult", "ontoolinputpartial"],
  },
  {
    directory: "kpi-viewer",
    component: "KpiViewer.tsx",
    appName: "KPI Viewer",
    handlers: ["ontoolresult", "ontoolinputpartial"],
  },
  {
    directory: "stock-viewer",
    component: "StockViewer.tsx",
    appName: "Stock Viewer",
    handlers: ["ontoolresult", "ontoolinputpartial"],
  },
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function assertBeforeConnect(
  source: string,
  viewer: string,
  appIdentifier: string,
  handlers: string[],
): void {
  const connectIndex = source.indexOf(`${appIdentifier}.connect(`);
  assert(connectIndex >= 0, `${viewer}: app.connect() is missing`);

  for (const handler of handlers) {
    const assignment = new RegExp(
      `${escapeRegExp(appIdentifier)}\\.${handler}\\s*=`,
    ).exec(source);
    const handlerIndex = assignment?.index ?? -1;
    assert(handlerIndex >= 0, `${viewer}: app.${handler} is missing`);
    assert(
      handlerIndex < connectIndex,
      `${viewer}: app.${handler} must be registered before app.connect()`,
    );
  }
}

Deno.test("ERPNext viewer sources register MCP handlers before connect", async () => {
  assertEquals(VIEWERS.length, 7);
  for (const viewer of VIEWERS) {
    const source = await Deno.readTextFile(
      new URL(
        `./${viewer.directory}/src/${viewer.component}`,
        import.meta.url,
      ),
    );
    assertBeforeConnect(source, viewer.directory, "app", viewer.handlers);
  }
});

Deno.test("ERPNext viewer bundles preserve handler-before-connect ordering", async () => {
  assertEquals(VIEWERS.length, 7);
  const builtViewers = await Promise.all(VIEWERS.map(async (viewer) => {
    try {
      const bundle = await Deno.readTextFile(
        new URL(`./dist/${viewer.directory}/index.html`, import.meta.url),
      );
      return { viewer, bundle };
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) return undefined;
      throw error;
    }
  }));
  const present = builtViewers.filter((entry) => entry !== undefined);
  if (present.length === 0) return;
  assertEquals(
    present.length,
    VIEWERS.length,
    "Either all viewer bundles must be built or none of them",
  );

  for (const { viewer, bundle } of present) {
    const declaration = bundle.match(
      new RegExp(
        `const\\s+([A-Za-z_$][\\w$]*)=new\\s+[A-Za-z_$][\\w$]*\\(\\{name:"${
          escapeRegExp(viewer.appName)
        }"`,
      ),
    );
    assert(declaration, `${viewer.directory}: MCP App declaration is missing`);
    const appIdentifier = declaration[1];
    assertBeforeConnect(
      bundle.slice(declaration.index),
      viewer.directory,
      appIdentifier,
      viewer.handlers,
    );
  }
});
