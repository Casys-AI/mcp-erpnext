import variant from "@jitl/quickjs-singlefile-browser-release-sync";
import {
  newQuickJSWASMModuleFromVariant,
  type QuickJSHandle,
  Scope,
} from "quickjs-emscripten-core";

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

    let calls = 0;
    const captured = new Map<QuickJSHandle, { native: T; name: string }>();
    const selected = new Map<QuickJSHandle, SelectedErpResult<T>>();
    const routes: SelectedErpSync<T>[] = [];
    function original(value: QuickJSHandle) {
      for (const entry of captured) {
        if (vm.eq(value, entry[0])) return entry;
      }
    }
    const pending: Array<() => Promise<void>> = [];
    // Keep external inputs such as attachments in the host. Both bindings
    // enter the same queue, budget and authorization path.
    function enqueue(
      nameHandle: QuickJSHandle,
      argsHandle?: QuickJSHandle,
    ): QuickJSHandle {
      if (++calls > MAX_CALLS) {
        throw new Error("Maximum of 12 ERP calls per program.");
      }
      if (!nameHandle || vm.typeof(nameHandle) !== "string") {
        throw new Error("Use erp.call(name, args).");
      }
      const name = vm.getString(nameHandle);
      const args = argsHandle ? fromGuest(argsHandle) : input;
      if (typeof args !== "object" || args === null || Array.isArray(args)) {
        throw new Error("Expected an argument object.");
      }
      const deferred = keep(vm.newPromise());
      // Only start host I/O when the guest yields. No background work can
      // access a disposed VM, including after an unawaited call or timeout.
      pending.push(async () => {
        const started = performance.now();
        let timer: ReturnType<typeof setTimeout> | undefined;
        let receipt: T;
        const mutating = mutations.has(name);
        try {
          const response = call(
            name,
            (argsHandle ? args : structuredClone(args)) as Record<
              string,
              unknown
            >,
          );
          if (mutating) {
            // Wait for a definite business result. The ERP client bounds its
            // own requests; abandoning an approved write here risks retrying it.
            receipt = await response;
          } else {
            const timeout = new Promise<never>((_, reject) => {
              timer = setTimeout(
                () => reject(new Error("ERP program timed out.")),
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
          const reason = keep(
            vm.newString(
              cause instanceof Error ? cause.message : String(cause),
            ),
          );
          deferred.reject(reason);
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
          throw new SuspendCodeMode(
            `ERPNext completed ${name}, but its result could not be passed to the program. Check the record before retrying.`,
          );
        }
        if (vm.typeof(value) === "object" && !vm.eq(value, vm.null)) {
          captured.set(value, { native: receipt, name });
        }
        deferred.resolve(value);
      });
      return deferred.handle.dup();
    }
    const callFunction = keep(vm.newFunction("call", (name, args) => {
      if (!args) throw new Error("Use erp.call(name, args).");
      return enqueue(name, args);
    }));
    const withInput = keep(vm.newFunction("callWithInput", (name) => {
      if (!input) {
        throw new Error("Supply an input object in the execute arguments.");
      }
      return enqueue(name);
    }));
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
    vm.setProp(erp, "call", callFunction);
    vm.setProp(erp, "panel", panel);
    vm.setProp(erp, "sync", sync);
    vm.setProp(erp, "callWithInput", withInput);
    vm.setProp(vm.global, "erp", erp);

    const program = keep(vm.unwrapResult(vm.evalCode(
      `(async () => { "use strict";\n${code}\n})()`,
      "erpnext-program.js",
      { type: "global" },
    )));
    for (;;) {
      if (expired()) throw new Error("ERP program timed out.");
      const state = vm.getPromiseState(program);
      if (state.type === "fulfilled") {
        const value = keep(state.value);
        if (selected.size) {
          return {
            panels: [...selected.values()],
            sync: routes,
            value: vm.typeof(value) === "undefined" ? null : fromGuest(value),
          };
        }
        const receipt = original(value);
        if (receipt) return { native: receipt[1].native };
        return { value: fromGuest(value) };
      }
      if (state.type === "rejected") {
        const reason = vm.dump(keep(state.error));
        throw new Error(
          typeof reason === "string"
            ? reason
            : String(reason?.message ?? "JavaScript failed."),
        );
      }
      if (vm.runtime.hasPendingJob()) {
        vm.unwrapResult(vm.runtime.executePendingJobs(1));
      } else if (pending.length) await pending.shift()!();
      else throw new Error("JavaScript is waiting on an unresolved promise.");
    }
  });
}
