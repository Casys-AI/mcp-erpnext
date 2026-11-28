import variant from "@jitl/quickjs-singlefile-browser-release-sync";
import {
  newQuickJSWASMModuleFromVariant,
  type QuickJSHandle,
  Scope,
} from "quickjs-emscripten-core";
import {
  bounded,
  CodeModeError,
  codeModeMessage,
  isCodedMessage,
} from "./errors.ts";
import { parseToolInputError, renderErrorText } from "../tools/errors.ts";

const MAX_CODE = 16_384;
const MAX_CALLS = 12;
const CPU_MS = 1_500;
const WALL_MS = 60_000;
const MAX_JSON = 1024 * 1024;
/** A trusted host suspension bypasses guest catch handlers and destroys this VM. */
export class SuspendCodeMode extends Error {}

export interface SelectedErpResult<T> {
  readonly native: T;
  readonly name: string;
  readonly title: string;
}
export interface SelectedErpSync<T> {
  readonly from: SelectedErpResult<T>;
  readonly event: string;
  readonly to: SelectedErpResult<T>;
  readonly action: string;
}
type ProgramResult<T> =
  | { native: T }
  | { value: unknown }
  | {
    panels: SelectedErpResult<T>[];
    sync: SelectedErpSync<T>[];
    value: unknown;
  };

let engine: ReturnType<typeof newQuickJSWASMModuleFromVariant> | undefined;

/**
 * Run one ERP program in a fresh QuickJS/Wasm runtime. Only detached
 * JSON crosses into the VM. The host keeps the native receipt for exact object
 * returns, so a computed object can never select a viewer.
 */
export async function runCodeProgram<T extends { readonly data: unknown }>(
  code: unknown,
  catalog: readonly unknown[],
  call: (name: string, args: Record<string, unknown>) => Promise<T>,
  mutations: ReadonlySet<string> = new Set(),
  input?: Record<string, unknown>,
  params: Record<string, unknown> = {},
): Promise<ProgramResult<T>> {
  if (typeof code !== "string" || !code.trim() || code.length > MAX_CODE) {
    throw new Error(
      "Supply a JavaScript function body of at most 16,384 characters.",
    );
  }
  engine ??= newQuickJSWASMModuleFromVariant(variant);
  const module = await engine;
  try {
    return await Scope.withScopeAsync(async (scope) => {
      const keep = scope.manage;
      const vm = keep(module.newContext());
      let wallDeadline = performance.now() + WALL_MS;
      let cpuDeadline = performance.now() + CPU_MS;
      vm.runtime.setMemoryLimit(16 * 1024 * 1024);
      vm.runtime.setMaxStackSize(256 * 1024);
      const expired = () =>
        performance.now() >= Math.min(cpuDeadline, wallDeadline);
      vm.runtime.setInterruptHandler(expired);

      // Capture the intrinsics before running the program. Frozen values can be
      // passed directly to other reads or copied and transformed as ordinary JS.
      const decode = keep(vm.unwrapResult(vm.evalCode(`(() => {
      const parse = JSON.parse, values = Object.values, freeze = Object.freeze;
      function freezeTree(value) {
        if (value && typeof value === "object") {
          const children = values(value);
          for (let i = 0; i < children.length; i++) freezeTree(children[i]);
          freeze(value);
        }
        return value;
      }
      return text => freezeTree(parse(text));
    })()`)));
      const stringify = keep(
        vm.unwrapResult(vm.evalCode("JSON.stringify.bind(JSON)")),
      );
      function intoGuest(value: unknown): QuickJSHandle {
        const text = JSON.stringify(value);
        if (text === undefined || text.length > MAX_JSON) {
          throw new Error("ERP data exceeds the JSON size limit.");
        }
        const wire = vm.newString(text);
        try {
          return keep(
            vm.unwrapResult(vm.callFunction(decode, vm.undefined, wire)),
          );
        } finally {
          wire.dispose();
        }
      }
      function fromGuest(value: QuickJSHandle): unknown {
        const wire = vm.unwrapResult(
          vm.callFunction(stringify, vm.undefined, value),
        );
        try {
          if (vm.typeof(wire) !== "string") {
            throw new Error("Expected a JSON value.");
          }
          const text = vm.getString(wire);
          if (text.length > MAX_JSON) {
            throw new Error("JSON value exceeds the size limit.");
          }
          return JSON.parse(text);
        } finally {
          wire.dispose();
        }
      }

      /**
       * The message of a rejected program, read from the value itself so a
       * circular property the program added cannot hide it.
       */
      function rejectionMessage(error: QuickJSHandle): string {
        if (vm.typeof(error) === "string") return vm.getString(error);
        try {
          if (vm.typeof(error) === "object") {
            const field = keep(vm.getProp(error, "message"));
            // A getter can spend the budget and leave an exception handle.
            if (expired()) throw new Error(TIMEOUT_MESSAGE);
            if (vm.typeof(field) === "string") return vm.getString(field);
          }
        } catch (cause) {
          // A message getter that throws, or that ran out of budget.
          if (expired()) throw new Error(TIMEOUT_MESSAGE);
          if (cause instanceof SuspendCodeMode) throw cause;
        }
        return "JavaScript failed.";
      }

      /**
       * An ERP failure as the program sees it: an Error whose message keeps
       * the `[operation] CODE:` contract, with `code` and `recovery` readable
       * from a guest catch handler.
       */
      function guestError(cause: unknown, operation: string): QuickJSHandle {
        const text = renderErrorText(cause, operation);
        const error = keep(vm.newError({ name: "ErpError", message: text }));
        const parsed = parseToolInputError(text);
        if (parsed) {
          // Own properties, so a prototype the program changed cannot shadow them.
          for (
            const [key, value] of [["code", parsed.code], [
              "recovery",
              parsed.recovery,
            ]]
          ) {
            vm.defineProp(error, key, {
              value: keep(vm.newString(value)),
              enumerable: true,
            });
          }
        }
        return error;
      }

      let calls = 0;
      const captured = new Map<QuickJSHandle, { native: T; name: string }>();
      const selected = new Map<QuickJSHandle, SelectedErpResult<T>>();
      const routes: SelectedErpSync<T>[] = [];
      function original(value: QuickJSHandle) {
        for (const entry of captured) {
          if (vm.eq(value, entry[0])) return entry;
        }
      }
      const pending: PendingCall[] = [];
      // Calls the program created but has not consumed yet (no await, then or
      // Promise.all). They are queued only when consumed, so a write the
      // program never awaits is never sent, whatever it awaits afterwards.
      const declared = new Map<number, DeclaredCall>();
      let nextCall = 0;
      /**
       * Validate and detach a call when the program creates it, so a later
       * edit of its argument object cannot change what is sent.
       */
      function declare(
        nameHandle: QuickJSHandle | undefined,
        argsHandle: QuickJSHandle | undefined,
        fromInput: boolean,
      ): number {
        // Count at creation: each declared call holds detached arguments (up
        // to the JSON limit) in the host, consumed or not.
        if (nextCall >= MAX_CALLS) throw callLimit();
        if (!nameHandle || vm.typeof(nameHandle) !== "string") {
          throw new Error("Use erp.call(name, args).");
        }
        if (fromInput && !input) {
          throw new Error("Supply an input object in the execute arguments.");
        }
        if (
          !fromInput && (!argsHandle || vm.typeof(argsHandle) === "undefined")
        ) {
          throw new Error("Use erp.call(name, args).");
        }
        const name = vm.getString(nameHandle);
        // External inputs such as attachments stay in the host until sent.
        const args = fromInput ? input : fromGuest(argsHandle!);
        if (typeof args !== "object" || args === null || Array.isArray(args)) {
          throw new Error("Expected an argument object.");
        }
        const id = nextCall++;
        declared.set(id, {
          name,
          mutating: mutations.has(name),
          args: args as Record<string, unknown>,
          fromInput,
        });
        return id;
      }
      // Both bindings enter the same queue, budget and authorization path.
      function enqueue(id: number): QuickJSHandle {
        const entry = declared.get(id);
        if (!entry) throw new Error("Use erp.call(name, args).");
        declared.delete(id);
        if (++calls > MAX_CALLS) throw callLimit();
        const { name, mutating, args, fromInput } = entry;
        const deferred = keep(vm.newPromise());
        // Only start host I/O when the guest yields. No background work can
        // access a disposed VM, including after an unawaited call or timeout.
        pending.push({
          name,
          mutating,
          run: async () => {
            const started = performance.now();
            let timer: ReturnType<typeof setTimeout> | undefined;
            let receipt: T;
            try {
              const response = call(
                name,
                fromInput ? structuredClone(args) : args,
              );
              if (mutating) {
                // Wait for a definite business result. The ERP client bounds its
                // own requests; abandoning an approved write here risks retrying it.
                receipt = await response;
              } else {
                const timeout = new Promise<never>((_, reject) => {
                  timer = setTimeout(
                    () => reject(new Error(TIMEOUT_MESSAGE)),
                    wallDeadline - started,
                  );
                });
                receipt = await Promise.race([
                  response,
                  timeout,
                ]);
              }
            } catch (cause) {
              if (cause instanceof SuspendCodeMode) throw cause;
              deferred.reject(guestError(cause, name));
              return;
            } finally {
              clearTimeout(timer);
              // Charging network latency against the CPU budget would make a slow
              // ERP request interrupt otherwise trivial JavaScript.
              const elapsed = performance.now() - started;
              cpuDeadline += elapsed;
              if (mutating) wallDeadline += elapsed;
            }
            let value: QuickJSHandle;
            try {
              value = intoGuest(receipt.data);
            } catch (error) {
              if (!mutating) throw error;
              // ERP may already have committed this change. Do not present a
              // projection failure as a retryable business-operation error.
              throw new SuspendCodeMode(codeModeMessage(
                "WRITE_APPLIED_THEN_FAILED",
                `ERPNext completed ${name}, but its result could not be passed to the program`,
                "Check the record in ERPNext before retrying, and do not repeat this write",
              ));
            }
            if (vm.typeof(value) === "object" && !vm.eq(value, vm.null)) {
              captured.set(value, { native: receipt, name });
            }
            deferred.resolve(value);
          },
        });
        return deferred.handle.dup();
      }
      const declareCall = keep(vm.newFunction(
        "declare",
        (name, args, fromInput) => {
          try {
            return vm.newNumber(
              declare(name, args, vm.dump(fromInput) === true),
            );
          } catch (error) {
            // Throw the coded Error in the program, where erp.call is written.
            return { error: guestError(error, "execute") };
          }
        },
      ));
      const startCall = keep(vm.newFunction("start", (id) => {
        try {
          return enqueue(vm.getNumber(id));
        } catch (error) {
          if (error instanceof SuspendCodeMode) throw error;
          // Reject with the same coded Error as an ERP failure, so the
          // program can read e.code (CALL_LIMIT) in its catch.
          const failed = keep(vm.newPromise());
          failed.reject(guestError(error, "execute"));
          return failed.handle.dup();
        }
      }));
      // erp.call returns a thenable, created and validated at once, that
      // reaches the host queue only when the program consumes it. A failed
      // start is cached, so consuming it again neither retries nor spends the
      // call budget. Intrinsics are captured before the program runs.
      const makeCalls = keep(vm.unwrapResult(vm.evalCode(`(() => {
      const freeze = Object.freeze, reject = Promise.reject.bind(Promise);
      return (declare, start) => {
        function lazy(id) {
          let promise;
          const run = () => {
            if (promise === undefined) {
              try { promise = start(id); } catch (error) { promise = reject(error); }
            }
            return promise;
          };
          return freeze({
            then(onFulfilled, onRejected) { return run().then(onFulfilled, onRejected); },
            catch(onRejected) { return run().then(undefined, onRejected); },
            finally(onFinally) { return run().finally(onFinally); },
          });
        }
        return {
          call(name, args) { return lazy(declare(name, args, false)); },
          callWithInput(name) { return lazy(declare(name, undefined, true)); },
        };
      };
    })()`)));
      const calls_ = keep(vm.unwrapResult(
        vm.callFunction(makeCalls, vm.undefined, declareCall, startCall),
      ));
      const panel = keep(vm.newFunction("panel", (value, label, ...extra) => {
        if (!value || extra.length) {
          throw new Error("Use erp.panel(originalResult, optionalTitle).");
        }
        const receipt = original(value);
        if (!receipt) {
          throw new Error("Select an original result from this ERP execution.");
        }
        const [handle, metadata] = receipt;
        if (label && vm.typeof(label) !== "string") {
          throw new Error("Supply a text panel title.");
        }
        const title = label ? vm.getString(label) : metadata.name;
        if (!title.trim() || title.length > 120) {
          throw new Error("Supply a panel title of 1 to 120 characters.");
        }
        selected.set(handle, { ...metadata, title });
        return vm.undefined;
      }));
      const syncPorts = keep(vm.newFunction(
        "syncPorts",
        (source, eventName, target, actionName) => {
          const sourceReceipt = original(source);
          const targetReceipt = original(target);
          const from = sourceReceipt && selected.get(sourceReceipt[0]);
          const to = targetReceipt && selected.get(targetReceipt[0]);
          if (!from || !to || from.native === to.native) {
            throw new Error(
              "Select two distinct original results with erp.panel before calling erp.sync.",
            );
          }
          if (
            vm.typeof(eventName) !== "string" ||
            vm.typeof(actionName) !== "string"
          ) {
            throw new Error("Supply an event and action as strings.");
          }
          const event = vm.getString(eventName);
          const action = vm.getString(actionName);
          if (!event || !action || event.length > 120 || action.length > 120) {
            throw new Error(
              "Supply event and action names of 1 to 120 characters.",
            );
          }
          if (
            routes.some((route) =>
              route.from.native === from.native && route.event === event &&
              route.to.native === to.native && route.action === action
            )
          ) return vm.undefined;
          if (routes.length >= MAX_CALLS * (MAX_CALLS - 1)) {
            throw new Error("Too many ERP synchronization routes.");
          }
          routes.push({ from, event, to, action });
          return vm.undefined;
        },
      ));
      // Keep the bridge private and hand the server actual guest object handles.
      const makeSync = keep(vm.unwrapResult(vm.evalCode(`(() => {
      const keys = Reflect.ownKeys;
      return link => function sync(options) {
        if (arguments.length !== 1 || !options || typeof options !== "object") {
          throw new Error("Use erp.sync({from, event, to, action}).");
        }
        const fields = keys(options);
        if (fields.length !== 4) {
          throw new Error("Use erp.sync({from, event, to, action}).");
        }
        for (let i = 0; i < fields.length; i++) {
          const field = fields[i];
          if (field !== "from" && field !== "event" && field !== "to" && field !== "action") {
            throw new Error("Use erp.sync({from, event, to, action}).");
          }
        }
        return link(options.from, options.event, options.to, options.action);
      };
    })()`)));
      const sync = keep(
        vm.unwrapResult(vm.callFunction(makeSync, vm.undefined, syncPorts)),
      );
      const erp = keep(vm.newObject());
      vm.setProp(erp, "catalog", intoGuest(catalog));
      vm.setProp(erp, "params", intoGuest(params));
      vm.setProp(erp, "call", keep(vm.getProp(calls_, "call")));
      vm.setProp(erp, "panel", panel);
      vm.setProp(erp, "sync", sync);
      vm.setProp(
        erp,
        "callWithInput",
        keep(vm.getProp(calls_, "callWithInput")),
      );
      vm.setProp(vm.global, "erp", erp);

      const program = keep(vm.unwrapResult(vm.evalCode(
        `(async () => { "use strict";\n${code}\n})()`,
        "erpnext-program.js",
        { type: "global" },
      )));
      for (;;) {
        if (expired()) throw new Error(TIMEOUT_MESSAGE);
        const state = vm.getPromiseState(program);
        if (state.type === "fulfilled") {
          const value = keep(state.value);
          let result: ProgramResult<T> | undefined;
          let failure: unknown;
          try {
            if (selected.size) {
              result = {
                panels: [...selected.values()],
                sync: routes,
                value: vm.typeof(value) === "undefined"
                  ? null
                  : fromGuest(value),
              };
            } else {
              const receipt = original(value);
              result = receipt
                ? { native: receipt[1].native }
                : { value: fromGuest(value) };
            }
          } catch (error) {
            failure = error;
          }
          // Checked after serialization, which can run program code (toJSON),
          // and before its failure: a write left unsent matters more than a
          // result that cannot be returned. Unconsumed and still-queued calls
          // never reached ERPNext.
          const dropped = unawaitedCallsError([
            ...declared.values(),
            ...pending,
          ]);
          if (dropped) throw dropped;
          if (failure !== undefined || !result) throw failure;
          return result;
        }
        if (state.type === "rejected") {
          const message = rejectionMessage(keep(state.error));
          // Host errors raised inside the program (call limit, unknown
          // operation, ERP tool errors) already carry their own code.
          if (isCodedMessage(message)) throw new Error(message);
          throw new CodeModeError("PROGRAM_FAILED", bounded(message), {
            recovery: PROGRAM_RECOVERY,
          });
        }
        if (vm.runtime.hasPendingJob()) {
          vm.unwrapResult(vm.runtime.executePendingJobs(1));
        } else if (pending.length) await pending.shift()!.run();
        else {
          throw new CodeModeError(
            "PROGRAM_FAILED",
            "The program is waiting on an unresolved promise",
            {
              recovery:
                "Await only erp.call results or promises the program resolves itself",
            },
          );
        }
      }
    });
  } catch (error) {
    throw atBoundary(error);
  }
}

function callLimit(): CodeModeError {
  return new CodeModeError(
    "CALL_LIMIT",
    `Maximum of ${MAX_CALLS} ERP calls per program`,
    {
      recovery:
        "Read more per call with filters, fields and limit, or split the work across several execute calls",
    },
  );
}

const PROGRAM_RECOVERY =
  "Fix the program or its arguments and run it again; check erp.catalog for operation names and input schemas";

/**
 * Every failure leaves the sandbox with a code: syntax errors, results that
 * cannot be serialized and budget interrupts included. Suspensions and errors
 * that already carry a code pass through unchanged.
 */
function atBoundary(error: unknown): Error {
  if (error instanceof SuspendCodeMode || error instanceof CodeModeError) {
    return error;
  }
  const message = error instanceof Error ? error.message : String(error);
  if (isCodedMessage(message)) {
    return error instanceof Error ? error : new Error(message);
  }
  // QuickJS reports a budget interrupt raised during a host-driven call (a
  // toJSON while the result is serialized) as a bare "interrupted".
  if (/\binterrupted\b/.test(message)) return new Error(TIMEOUT_MESSAGE);
  return new CodeModeError("PROGRAM_FAILED", bounded(message), {
    recovery: PROGRAM_RECOVERY,
  });
}

const TIMEOUT_MESSAGE = codeModeMessage(
  "PROGRAM_TIMEOUT",
  "The ERP program ran past its time budget",
  "Do less work in JavaScript per execution, or split it across several execute calls; ERP request latency does not count against the CPU budget",
);

/** An `erp.call` the program created; `mutating` marks a write. */
interface UnsentCall {
  readonly name: string;
  readonly mutating: boolean;
}

/** A created `erp.call`, with its arguments detached when it was created. */
interface DeclaredCall extends UnsentCall {
  readonly args: Record<string, unknown>;
  readonly fromInput: boolean;
}

/** A consumed `erp.call`, queued until the host loop runs it. */
interface PendingCall extends UnsentCall {
  readonly run: () => Promise<void>;
}

/**
 * Decide what a program that finished with calls it never consumed, or still
 * queued, gets back. Those calls never ran: nothing was read and nothing was
 * written. A dropped read changes nothing, so its result stands. A dropped
 * write would let the agent report a change that never reached ERPNext, so it
 * fails.
 */
function unawaitedCallsError(
  queued: readonly UnsentCall[],
): CodeModeError | undefined {
  const writes = queued.filter((call) => call.mutating).map((call) =>
    call.name
  );
  if (!writes.length) return undefined;
  return new CodeModeError(
    "UNAWAITED_CALLS",
    `The program finished before awaiting ${
      writes.join(", ")
    }. These changes were not sent to ERPNext`,
    {
      recovery:
        "Put await before each erp.call that changes ERPNext, then run the program again",
      context: { notSent: writes },
    },
  );
}
