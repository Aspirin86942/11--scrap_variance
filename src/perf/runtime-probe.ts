export interface RuntimeCapability {
  name: string;
  supported: boolean;
  note: "支持" | "不支持";
}

interface RuntimeProbeRoot {
  performance?: {
    now?: unknown;
  };
  console?: {
    log?: unknown;
  };
  setTimeout?: unknown;
  Promise?: unknown;
  Worker?: unknown;
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

export function probeRuntimeCapabilities(root: unknown = globalThis, fallbackRoot: unknown = globalThis): RuntimeCapability[] {
  const runtime = root as RuntimeProbeRoot;
  const fallbackRuntime = fallbackRoot as RuntimeProbeRoot;

  return [
    capability("performance.now", hasFunction(runtime.performance?.now, fallbackRuntime.performance?.now)),
    capability("console.log", hasFunction(runtime.console?.log, fallbackRuntime.console?.log)),
    capability("setTimeout", hasFunction(runtime.setTimeout, fallbackRuntime.setTimeout)),
    capability("Promise", hasFunction(runtime.Promise, fallbackRuntime.Promise)),
    capability("Worker", hasFunction(runtime.Worker, fallbackRuntime.Worker))
  ];
}
