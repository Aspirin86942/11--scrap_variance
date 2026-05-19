import { getMemorySample } from "./memory";

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

function hasMemoryApi(...roots: unknown[]): boolean {
  // 能力探针和实际采样共用 getMemorySample，避免诊断表声称支持但采样又拿不到值。
  return roots.some((root) => getMemorySample(root).available);
}

export function probeRuntimeCapabilities(root: unknown = globalThis, fallbackRoot: unknown = globalThis): RuntimeCapability[] {
  const runtime = root as RuntimeProbeRoot;
  const fallbackRuntime = fallbackRoot as RuntimeProbeRoot;

  // 这些能力决定诊断、定时器和弹窗轮询能否在当前 WPS/浏览器宿主里可靠运行。
  return [
    capability("performance.now", hasFunction(runtime.performance?.now, fallbackRuntime.performance?.now)),
    capability("console.log", hasFunction(runtime.console?.log, fallbackRuntime.console?.log)),
    capability("setTimeout", hasFunction(runtime.setTimeout, fallbackRuntime.setTimeout)),
    capability("Promise", hasFunction(runtime.Promise, fallbackRuntime.Promise)),
    capability("Worker", hasFunction(runtime.Worker, fallbackRuntime.Worker)),
    capability("memory_api", hasMemoryApi(runtime, fallbackRuntime))
  ];
}
