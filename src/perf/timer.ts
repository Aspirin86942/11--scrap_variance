interface TimerRoot {
  performance?: {
    now?: () => number;
  };
}

export function nowMs(root: unknown = globalThis): number {
  const timerRoot = root as TimerRoot;
  if (typeof timerRoot.performance?.now === "function") {
    return timerRoot.performance.now();
  }
  return Date.now();
}
