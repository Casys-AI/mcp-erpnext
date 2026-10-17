import type { App } from "@modelcontextprotocol/ext-apps";
import { useLayoutEffect, useRef, useState } from "preact/hooks";
import { extractToolResultText } from "../refresh.ts";
import {
  type NativeDocTypeField,
  nativeDocTypeFieldsOf,
} from "./company-sections.ts";
import { documentEnvelopeOf } from "./model.ts";
import type { DocumentEnvelope } from "./types.ts";

export interface CompanySchemaState {
  schemaFields?: readonly NativeDocTypeField[];
  status: "loading" | "ready" | "unavailable";
}

interface ScopedSchemaState extends CompanySchemaState {
  app: App | undefined;
  scope: string;
  allowed: boolean;
}

const GET_TOOL = "erpnext_doc_get";

export function useCompanySections(
  app: App | undefined,
  envelope: DocumentEnvelope,
): CompanySchemaState {
  const allowed = envelope.doctype === "Company" &&
    Boolean(app?.getHostCapabilities()?.serverTools) &&
    Boolean(envelope.availableTools?.includes(GET_TOOL));
  const scope = JSON.stringify([
    envelope.doctype,
    envelope.name,
    envelope.document.modified,
    envelope.availableTools,
  ]);
  const current = useRef({ app, scope, allowed, envelope });
  current.current = { app, scope, allowed, envelope };
  const [state, setState] = useState<ScopedSchemaState>({
    app,
    scope,
    allowed,
    status: allowed ? "loading" : "unavailable",
  });

  useLayoutEffect(() => {
    let cancelled = false;
    const isCurrent = () =>
      !cancelled && current.current.app === app &&
      current.current.scope === scope && current.current.allowed &&
      Boolean(app?.getHostCapabilities()?.serverTools) &&
      Boolean(current.current.envelope.availableTools?.includes(GET_TOOL));

    setState({
      app,
      scope,
      allowed,
      status: allowed ? "loading" : "unavailable",
    });
    if (app && allowed) {
      void (async () => {
        try {
          if (!isCurrent()) return;
          const result = await app.callServerTool({
            name: GET_TOOL,
            arguments: { doctype: "DocType", name: "Company" },
          }, { timeout: 15_000 });
          if (!isCurrent()) return;
          if (result.isError === true) throw new Error("schema unavailable");
          const text = extractToolResultText(result);
          const schema = text ? documentEnvelopeOf(JSON.parse(text)) : null;
          const schemaFields = schema?.doctype === "DocType" &&
              schema.name === "Company"
            ? nativeDocTypeFieldsOf(schema.document.fields)
            : undefined;
          if (!schemaFields) throw new Error("schema unavailable");
          setState({ app, scope, allowed, schemaFields, status: "ready" });
        } catch {
          if (isCurrent()) {
            setState({ app, scope, allowed, status: "unavailable" });
          }
        }
      })();
    }
    return () => {
      cancelled = true;
    };
  }, [app, scope, allowed]);

  if (state.app !== app || state.scope !== scope || state.allowed !== allowed) {
    return { status: allowed ? "loading" : "unavailable" };
  }
  return { status: state.status, schemaFields: state.schemaFields };
}
