import { nowMs } from "../perf/timer";
import type { ScrapVarianceGlobal } from "../types/wps";

const USER_NOTIFIED_ERROR_KEY = "__scrapVarianceUserNotified";

function runtimeRoot(root: ScrapVarianceGlobal | undefined): ScrapVarianceGlobal {
  return root ?? (globalThis as unknown as ScrapVarianceGlobal);
}

export function markUserNotifiedError(error: unknown): unknown {
  if (error && (typeof error === "object" || typeof error === "function")) {
    try {
      Object.defineProperty(error, USER_NOTIFIED_ERROR_KEY, {
        value: true,
        configurable: true
      });
    } catch {
      // 标记失败不能影响原始错误传播，外层最多按普通错误再提示一次。
    }
  }
  return error;
}

export function isUserNotifiedError(error: unknown): boolean {
  if (!error || (typeof error !== "object" && typeof error !== "function")) {
    return false;
  }
  return (error as Record<string, unknown>)[USER_NOTIFIED_ERROR_KEY] === true;
}

export function queryFeedbackErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function formatElapsedMs(value: number): string {
  return Math.max(0, value).toFixed(2);
}

export function showUserMessage(root: ScrapVarianceGlobal | undefined, message: string): void {
  const targetRoot = runtimeRoot(root);
  if (typeof targetRoot.alert === "function") {
    targetRoot.alert(message);
    return;
  }

  if (typeof targetRoot.console?.error === "function") {
    targetRoot.console.error(message);
  }
}

export function queryStartedAt(root: ScrapVarianceGlobal | undefined): number {
  return nowMs(runtimeRoot(root));
}

export function notifyQueryCompleted(
  root: ScrapVarianceGlobal | undefined,
  label: string,
  outputSheetName: string,
  startedAt: number
): void {
  const targetRoot = runtimeRoot(root);
  const elapsed = nowMs(targetRoot) - startedAt;
  showUserMessage(targetRoot, `${label}已完成\n耗时：${formatElapsedMs(elapsed)} ms\n结果已写入：${outputSheetName}`);
}

export function notifyQueryFailed(
  root: ScrapVarianceGlobal | undefined,
  label: string,
  error: unknown,
  startedAt: number
): void {
  const targetRoot = runtimeRoot(root);
  const elapsed = nowMs(targetRoot) - startedAt;
  showUserMessage(
    targetRoot,
    `${label}已失败\n耗时：${formatElapsedMs(elapsed)} ms\n错误：${queryFeedbackErrorMessage(error)}`
  );
}
