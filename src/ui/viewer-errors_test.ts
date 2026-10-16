import { assert, assertEquals } from "@std/assert";
import {
  isViewerResourceError,
  VIEWER_RESOURCE_ERROR_CODES,
  ViewerResourceError,
} from "./viewer-errors.ts";

const context = { url: "https://jsr.io/x", host: "jsr.io:443", status: 503 };

Deno.test("VIEWER_RESOURCE_ERROR_CODES is the closed list of remote viewer failures", () => {
  assertEquals([...VIEWER_RESOURCE_ERROR_CODES], [
    "VIEWER_REMOTE_PERMISSION_DENIED",
    "VIEWER_REMOTE_TIMEOUT",
    "VIEWER_REMOTE_HTTP_ERROR",
    "VIEWER_REMOTE_NETWORK_ERROR",
  ]);
});

Deno.test("ViewerResourceError exposes typed fields and a JSON message", () => {
  const error = new ViewerResourceError("VIEWER_REMOTE_HTTP_ERROR", "bad", {
    retryable: true,
    context,
    recovery: "retry",
  });

  assertEquals(error.name, "ViewerResourceError");
  assertEquals(error.code, "VIEWER_REMOTE_HTTP_ERROR");
  assertEquals(error.retryable, true);
  assertEquals(error.recovery, "retry");
  assertEquals(JSON.parse(error.message), {
    code: "VIEWER_REMOTE_HTTP_ERROR",
    message: "bad",
    retryable: true,
    context,
    recovery: "retry",
  });
});

Deno.test("ViewerResourceError is not retryable unless asked", () => {
  const error = new ViewerResourceError(
    "VIEWER_REMOTE_PERMISSION_DENIED",
    "d",
    {
      context,
      recovery: "r",
    },
  );
  assertEquals(error.retryable, false);
});

Deno.test("ViewerResourceError freezes a copy of the context", () => {
  const source = { ...context };
  const error = new ViewerResourceError("VIEWER_REMOTE_TIMEOUT", "t", {
    context: source,
    recovery: "r",
  });
  assert(Object.isFrozen(error.context));
  source.status = 1;
  assertEquals(error.context.status, 503);
});

Deno.test("isViewerResourceError only matches ViewerResourceError", () => {
  const error = new ViewerResourceError("VIEWER_REMOTE_TIMEOUT", "t", {
    context,
    recovery: "r",
  });
  assertEquals(isViewerResourceError(error), true);
  assertEquals(isViewerResourceError(new Error("x")), false);
  assertEquals(isViewerResourceError("VIEWER_REMOTE_TIMEOUT"), false);
});
