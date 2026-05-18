export interface RuntimeCapability {
  name: string;
  supported: boolean;
  note: "支持" | "不支持";
}

interface RuntimeProbeRoot {
  performance?: {
    now?: unknown;
    memory?: {
      usedJSHeapSize?: unknown;
    };
  };
  console?: {
    log?: unknown;
  };
  setTimeout?: unknown;
  Promise?: unknown;
  Worker?: unknown;
  process?: {
    memoryUsage?: unknown;
  };
}

function capability(name: string, supported: boolean): RuntimeCapability {
  return {
    name,
    supported,
    note: supported ? "支持" : "不支持"
  };
}

function hasFunction(rootValue: unknown, fallbackValue: unknown): boolean {
  return typeof rootValue === "function" || typeof fallbackValue === "function";
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function hasMemoryApi(...roots: RuntimeProbeRoot[]): boolean {
  return roots.some((root) => {
    if (typeof root.process?.memoryUsage === "function") {
      return true;
    }
    return isFiniteNumber(root.performance?.memory?.usedJSHeapSize);
  });
}

export function probeRuntimeCapabilities(root: unknown = globalThis, fallbackRoot: unknown = globalThis): RuntimeCapability[] {
  const runtime = root as RuntimeProbeRoot;
  const fallbackRuntime = fallbackRoot as RuntimeProbeRoot;

  return [
    capability("performance.now", hasFunction(runtime.performance?.now, fallbackRuntime.performance?.now)),
    capability("console.log", hasFunction(runtime.console?.log, fallbackRuntime.console?.log)),
    capability("setTimeout", hasFunction(runtime.setTimeout, fallbackRuntime.setTimeout)),
    capability("Promise", hasFunction(runtime.Promise, fallbackRuntime.Promise)),
    capability("Worker", hasFunction(runtime.Worker, fallbackRuntime.Worker)),
    capability("memory_api", hasMemoryApi(runtime, fallbackRuntime))
  ];
}
