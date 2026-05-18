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

export function probeRuntimeCapabilities(root: unknown = globalThis): RuntimeCapability[] {
  const runtime = root as RuntimeProbeRoot;
  return [
    capability("performance.now", typeof runtime.performance?.now === "function"),
    capability("console.log", typeof runtime.console?.log === "function"),
    capability("setTimeout", typeof runtime.setTimeout === "function"),
    capability("Promise", typeof runtime.Promise === "function"),
    capability("Worker", typeof runtime.Worker === "function")
  ];
}
