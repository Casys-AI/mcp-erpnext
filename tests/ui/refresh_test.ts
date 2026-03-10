import { assertEquals } from "jsr:@std/assert";
import {
  canRequestUiRefresh,
  extractToolResultText,
  normalizeUiRefreshFailureMessage,
  resolveUiRefreshRequest,
  type UiRefreshGate,
  type UiRefreshRequestData,
} from "../../src/ui/shared/refresh.ts";

function makeRequest(): UiRefreshRequestData {
  return {
    toolName: "erpnext_task_list",
    arguments: { limit: 20 },
  };
}

function makeGate(overrides: Partial<UiRefreshGate> = {}): UiRefreshGate {
  return {
    request: makeRequest(),
    visibilityState: "visible",
    refreshInFlight: false,
    now: 20_000,
    lastRefreshStartedAt: 0,
    minIntervalMs: 15_000,
    ...overrides,
  };
}

Deno.test("shared ui refresh - allows visible idle refresh after interval", () => {
  assertEquals(canRequestUiRefresh(makeGate()), true);
});

Deno.test("shared ui refresh - blocks hidden or in-flight refreshes", () => {
  assertEquals(canRequestUiRefresh(makeGate({ visibilityState: "hidden" })), false);
  assertEquals(canRequestUiRefresh(makeGate({ refreshInFlight: true })), false);
});

Deno.test("shared ui refresh - throttles scheduled refreshes until interval elapses", () => {
  assertEquals(
    canRequestUiRefresh(makeGate({ now: 4_000, lastRefreshStartedAt: 0 })),
    false,
  );
});

Deno.test("shared ui refresh - resolves payload request before host fallback", () => {
  assertEquals(
    resolveUiRefreshRequest(
      {
        refreshRequest: {
          toolName: "erpnext_issue_list",
          arguments: { status: "Open" },
        },
      },
      makeRequest(),
    ),
    {
      toolName: "erpnext_issue_list",
      arguments: { status: "Open" },
    },
  );
});

Deno.test("shared ui refresh - falls back to host request when payload has none", () => {
  assertEquals(resolveUiRefreshRequest({}, makeRequest()), makeRequest());
});

Deno.test("shared ui refresh - normalizes timeout failures for passive viewers", () => {
  assertEquals(
    normalizeUiRefreshFailureMessage(new Error("Tool call timed out after 10000ms")),
    "Refresh timed out",
  );
  assertEquals(
    normalizeUiRefreshFailureMessage(new Error("permission denied")),
    "Refresh failed",
  );
});

Deno.test("shared ui refresh - extracts text payloads from tool results", () => {
  assertEquals(
    extractToolResultText({
      content: [
        { type: "image", text: "ignored" },
        { type: "text", text: "{\"ok\":true}" },
      ],
    }),
    "{\"ok\":true}",
  );
  assertEquals(extractToolResultText({ content: [] }), null);
});
