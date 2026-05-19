interface TimerRoot {
  performance?: {
    now?: () => number;
  };
}

export function nowMs(root: unknown = globalThis): number {
  const timerRoot = root as TimerRoot;
  if (typeof timerRoot.performance?.now === "function") {
    // performance.now 精度更适合阶段耗时；没有时回退 Date.now 保持兼容。
    return timerRoot.performance.now();
  }
  return Date.now();
}
