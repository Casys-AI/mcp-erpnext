/**
 * MCP Data Loader — shared pattern for all ERPNext viewers
 *
 * Reads data from:
 * 1. window.mcpData (injected by MCP Apps host)
 * 2. postMessage from iframe parent
 *
 * Shows loading skeleton or empty state while waiting.
 */

import { useState, useEffect, ReactNode } from "react";
import { colors } from "./theme";

/** Extract data from window.mcpData */
function getMcpData<T>(): T | null {
  return (window as unknown as { mcpData?: T }).mcpData ?? null;
}

interface McpDataLoaderProps<T> {
  children: (data: T) => ReactNode;
  empty?: ReactNode;
}

export function McpDataLoader<T>({ children, empty }: McpDataLoaderProps<T>) {
  const [data, setData] = useState<T | null>(() => getMcpData<T>());
  const [loading, setLoading] = useState(!getMcpData<T>());

  useEffect(() => {
    // Try window.mcpData on mount
    const initial = getMcpData<T>();
    if (initial) {
      setData(initial);
      setLoading(false);
      return;
    }

    // Listen for postMessage (MCP Apps JSON-RPC protocol + legacy)
    let mcpInitialized = false;

    function handleMessage(event: MessageEvent) {
      if (!event.data || typeof event.data !== "object") return;
      const msg = event.data;

      // MCP Apps JSON-RPC protocol
      if (msg.jsonrpc === "2.0") {
        // Response to our ui/initialize request
        if (msg.id === "mcp-init" && msg.result) {
          // Send initialized notification → host will send tool-input + tool-result
          window.parent.postMessage(
            { jsonrpc: "2.0", method: "ui/notifications/initialized" },
            "*"
          );
          mcpInitialized = true;
          return;
        }

        // tool-result: extract data from content[0].text
        if (msg.method === "ui/notifications/tool-result") {
          const textContent = msg.params?.content?.find(
            (c: { type: string; text?: string }) => c.type === "text"
          );
          if (textContent?.text) {
            try {
              setData(JSON.parse(textContent.text) as T);
              setLoading(false);
            } catch {
              console.error("[McpDataLoader] Failed to parse tool-result text");
            }
          }
          return;
        }

        // tool-input: ignore (we only care about result)
        if (msg.method === "ui/notifications/tool-input") return;

        return;
      }

      // Legacy: direct mcpData or raw object
      const payload = msg.mcpData ?? msg;
      setData(payload as T);
      setLoading(false);
    }

    window.addEventListener("message", handleMessage);

    // Initiate MCP Apps handshake if inside iframe
    if (window.parent !== window) {
      window.parent.postMessage(
        {
          jsonrpc: "2.0",
          id: "mcp-init",
          method: "ui/initialize",
          params: {
            clientInfo: { name: "ERPNext Viewer", version: "1.0.0" },
            capabilities: {},
          },
        },
        "*"
      );
    }

    // Timeout: stop loading after 10s
    const timer = setTimeout(() => setLoading(false), 10_000);

    return () => {
      window.removeEventListener("message", handleMessage);
      clearTimeout(timer);
    };
  }, []);

  if (loading) {
    return <LoadingSkeleton />;
  }

  if (!data) {
    return <>{empty ?? <DefaultEmptyState />}</>;
  }

  return <>{children(data)}</>;
}

function LoadingSkeleton() {
  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="skeleton"
            style={{
              height: i === 1 ? 32 : 20,
              width: i === 1 ? "40%" : `${60 + Math.random() * 30}%`,
            }}
          />
        ))}
        <div style={{ marginTop: 8 }}>
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="skeleton"
              style={{ height: 36, marginBottom: 2 }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function DefaultEmptyState() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "48px 24px",
        color: colors.text.muted,
        gap: 16,
      }}
    >
      <svg
        width="48"
        height="48"
        viewBox="0 0 48 48"
        fill="none"
        style={{ opacity: 0.4 }}
      >
        <rect
          x="6"
          y="10"
          width="36"
          height="28"
          rx="4"
          stroke="currentColor"
          strokeWidth="2"
        />
        <path d="M6 18h36" stroke="currentColor" strokeWidth="2" />
        <circle cx="12" cy="14" r="1.5" fill="currentColor" />
        <circle cx="17" cy="14" r="1.5" fill="currentColor" />
        <circle cx="22" cy="14" r="1.5" fill="currentColor" />
        <rect x="14" y="24" width="20" height="2" rx="1" fill="currentColor" opacity="0.5" />
        <rect x="18" y="30" width="12" height="2" rx="1" fill="currentColor" opacity="0.3" />
      </svg>
      <div style={{ fontSize: 13, textAlign: "center" }}>
        No data available
        <div style={{ fontSize: 11, color: colors.text.faint, marginTop: 4 }}>
          Waiting for MCP tool result...
        </div>
      </div>
    </div>
  );
}

export default McpDataLoader;
