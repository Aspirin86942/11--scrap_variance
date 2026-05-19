import { detectOutputSheetKind, unsupportedOutputSheetMessage } from "../core/output-sheets";
import type { OutputSheetKind, RibbonQueryState } from "../types/scrap";
import type { ScrapVarianceGlobal } from "../types/wps";
import { readOutputQueryState } from "../wps-api/output-metadata";
import {
  EMPTY_QUERY_DIALOG_SUGGESTIONS,
  buildQueryDialogSuggestions,
  type QueryDialogSuggestions
} from "./suggestions";
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

interface QueryDialogInitialPayload {
  token: string;
  state?: RibbonQueryState;
  suggestions: QueryDialogSuggestions;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function getStorage(root: ScrapVarianceGlobal) {
  const storage = root.Application?.PluginStorage;
  if (!storage) {
    // 弹窗和主加载项之间只能通过 WPS PluginStorage 传递状态，没有它就无法可靠回传查询条件。
    throw new Error("当前 WPS 环境不支持 PluginStorage，无法打开查询弹窗。");
  }
  return storage;
}

function clearDialogResult(root: ScrapVarianceGlobal): void {
  getStorage(root).setItem(QUERY_DIALOG_RESULT_KEY, "");
}

function buildDialogInitialStateKey(token: string): string {
  // token 把本次弹窗的初始条件和返回结果隔离开，避免旧弹窗结果误触发当前查询。
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

  const payload: QueryDialogInitialPayload = {
    token,
    suggestions: EMPTY_QUERY_DIALOG_SUGGESTIONS
  };

  try {
    // 当前输出表自己的上次查询条件优先恢复；没有记录时弹窗使用空条件。
    const state = readOutputQueryState(activeSheet);
    if (state) {
      payload.state = state;
    }
  } catch (error) {
    root.console?.error?.("读取输出表查询条件失败，查询弹窗将使用空条件。", error);
  }

  // 候选项只是辅助输入，读取失败不能阻断查询弹窗本身。
  payload.suggestions = buildQueryDialogSuggestions(root);
  getStorage(root).setItem(buildDialogInitialStateKey(token), JSON.stringify(payload));
}

function readDialogResult(root: ScrapVarianceGlobal): QueryDialogResult | null {
  const raw = getStorage(root).getItem(QUERY_DIALOG_RESULT_KEY);
  if (typeof raw !== "string" || !raw.trim()) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<QueryDialogResult>;
    if (typeof parsed.token !== "string" || (parsed.action !== "query" && parsed.action !== "cancel")) {
      // storage 内容可能来自旧弹窗或被手动污染，结构不对时忽略而不是执行查询。
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
  // 静态 dialog 只负责收集条件，token 和输出页类型通过 URL 传给页面脚本。
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
    // 只接受当前 token 的结果，避免多个弹窗或旧结果互相串扰。
    return false;
  }

  clearDialogResult(root);
  clearDialogInitialState(root, token);
  if (result.action === "cancel") {
    return true;
  }

  try {
    // 弹窗只回传条件，真正查询仍在主加载项上下文执行，避免静态 dialog 直接操作工作簿。
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

  const outputKind = getActiveOutputKind(root);
  if (!outputKind) {
    throw new Error(unsupportedOutputSheetMessage());
  }

  const token = createDialogToken();
  clearDialogResult(root);
  writeDialogInitialState(root, token, outputKind);
  try {
    // ShowDialog 非阻塞返回时，后续用定时轮询等待静态页面写入 PluginStorage。
    application.ShowDialog(buildDialogUrl(token, outputKind), "报废差异查询条件", 560, 430, false);
  } catch (error) {
    clearDialogResult(root);
    clearDialogInitialState(root, token);
    throw error;
  }

  const startedAt = Date.now();
  const timer = globalThis.setInterval(() => {
    if (pollQueryDialogResult(root, token, runQuery, reportError)) {
      globalThis.clearInterval(timer);
      return;
    }

    if (Date.now() - startedAt > QUERY_DIALOG_TIMEOUT_MS) {
      // 超时要清掉本次 token 相关状态，否则下次打开弹窗可能读到残留数据。
      globalThis.clearInterval(timer);
      clearDialogResult(root);
      clearDialogInitialState(root, token);
      reportError(buildDialogTimeoutError());
    }
  }, QUERY_DIALOG_POLL_MS);
}
