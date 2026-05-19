import { detectOutputSheetKind } from "../core/output-sheets";
import type { OutputSheetKind, RibbonQueryState } from "../types/scrap";
import type { ScrapVarianceGlobal } from "../types/wps";
import { readOutputQueryState } from "../wps-api/output-metadata";
import { normalizeQueryDialogState, type QueryDialogStateInput } from "./state";

export const QUERY_DIALOG_RESULT_KEY = "ScrapVarianceQueryDialogResult";

const QUERY_DIALOG_INITIAL_STATE_KEY_PREFIX = "ScrapVarianceQueryDialogInitialState:";
const QUERY_DIALOG_TIMEOUT_MS = 5 * 60 * 1000;
const QUERY_DIALOG_POLL_MS = 250;

type DialogAction = "query" | "cancel";
type RunQuery = (state: RibbonQueryState) => void;
type ReportError = (error: unknown) => void;

interface QueryDialogResult {
  token: string;
  action: DialogAction;
  state?: QueryDialogStateInput;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function getStorage(root: ScrapVarianceGlobal) {
  const storage = root.Application?.PluginStorage;
  if (!storage) {
    throw new Error("当前 WPS 环境不支持 PluginStorage，无法打开查询弹窗。");
  }
  return storage;
}

function clearDialogResult(root: ScrapVarianceGlobal): void {
  getStorage(root).setItem(QUERY_DIALOG_RESULT_KEY, "");
}

function buildDialogInitialStateKey(token: string): string {
  return `${QUERY_DIALOG_INITIAL_STATE_KEY_PREFIX}${token}`;
}

function clearDialogInitialState(root: ScrapVarianceGlobal, token: string): void {
  const storage = getStorage(root);
  const key = buildDialogInitialStateKey(token);
  if (typeof storage.removeItem === "function") {
    storage.removeItem(key);
    return;
  }

  storage.setItem(key, "");
}

function writeDialogInitialState(root: ScrapVarianceGlobal, token: string, outputKind: OutputSheetKind | null): void {
  if (!outputKind) {
    return;
  }

  const activeSheet = root.Application?.ActiveSheet;
  if (!activeSheet) {
    return;
  }

  let state: RibbonQueryState | null = null;
  try {
    state = readOutputQueryState(activeSheet);
  } catch (error) {
    root.console?.error?.("读取输出表查询条件失败，查询弹窗将使用空条件。", error);
    return;
  }

  if (!state) {
    return;
  }

  getStorage(root).setItem(
    buildDialogInitialStateKey(token),
    JSON.stringify({
      token,
      state
    })
  );
}

function readDialogResult(root: ScrapVarianceGlobal): QueryDialogResult | null {
  const raw = getStorage(root).getItem(QUERY_DIALOG_RESULT_KEY);
  if (typeof raw !== "string" || !raw.trim()) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<QueryDialogResult>;
    if (typeof parsed.token !== "string" || (parsed.action !== "query" && parsed.action !== "cancel")) {
      return null;
    }

    return {
      token: parsed.token,
      action: parsed.action,
      state: parsed.state
    };
  } catch {
    return null;
  }
}

function createDialogToken(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function buildDialogUrl(token: string, outputKind: OutputSheetKind | null): string {
  const base =
    typeof globalThis.location?.href === "string" ? globalThis.location.href : "http://127.0.0.1:3889/index.html";
  const url = new URL("ui/query-dialog.html", base);
  url.searchParams.set("token", token);
  if (outputKind) {
    url.searchParams.set("outputKind", outputKind);
  }
  return url.toString();
}

function getActiveOutputKind(root: ScrapVarianceGlobal): OutputSheetKind | null {
  const sheetName = root.Application?.ActiveSheet?.Name;
  return typeof sheetName === "string" ? detectOutputSheetKind(sheetName) : null;
}

function buildDialogTimeoutError(): Error {
  return new Error("查询弹窗超时：没有收到查询或取消结果，请关闭弹窗后重试。");
}

export function pollQueryDialogResult(
  root: ScrapVarianceGlobal,
  token: string,
  runQuery: RunQuery,
  reportError: ReportError
): boolean {
  const result = readDialogResult(root);
  if (!result || result.token !== token) {
    return false;
  }

  clearDialogResult(root);
  clearDialogInitialState(root, token);
  if (result.action === "cancel") {
    return true;
  }

  try {
    runQuery(normalizeQueryDialogState(result.state));
  } catch (error) {
    reportError(error instanceof Error ? error : new Error(errorMessage(error)));
  }
  return true;
}

export function openQueryDialogAndRun(root: ScrapVarianceGlobal, runQuery: RunQuery, reportError: ReportError): void {
  const application = root.Application;
  if (typeof application?.ShowDialog !== "function") {
    throw new Error("当前 WPS 环境不支持 ShowDialog，无法打开查询弹窗。");
  }

  const token = createDialogToken();
  const outputKind = getActiveOutputKind(root);
  clearDialogResult(root);
  writeDialogInitialState(root, token, outputKind);
  application.ShowDialog(buildDialogUrl(token, outputKind), "报废差异查询条件", 560, 430, false);

  const startedAt = Date.now();
  const timer = globalThis.setInterval(() => {
    if (pollQueryDialogResult(root, token, runQuery, reportError)) {
      globalThis.clearInterval(timer);
      return;
    }

    if (Date.now() - startedAt > QUERY_DIALOG_TIMEOUT_MS) {
      globalThis.clearInterval(timer);
      clearDialogResult(root);
      clearDialogInitialState(root, token);
      reportError(buildDialogTimeoutError());
    }
  }, QUERY_DIALOG_POLL_MS);
}
