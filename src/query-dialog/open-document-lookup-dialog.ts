import type {
  DocumentLookupMode,
  DocumentLookupSelection,
  DocumentLookupSuggestions
} from "../core/document-lookup";
import type { ScrapVarianceGlobal, WpsPluginStorage } from "../types/wps";

export const DOCUMENT_LOOKUP_DIALOG_RESULT_KEY = "ScrapVarianceDocumentLookupDialogResult";
export const DOCUMENT_LOOKUP_INITIAL_STATE_KEY_PREFIX = "ScrapVarianceDocumentLookupInitialState:";

const DOCUMENT_LOOKUP_DIALOG_TIMEOUT_MS = 5 * 60 * 1000;
const DOCUMENT_LOOKUP_DIALOG_POLL_MS = 250;

type DialogAction = "query" | "cancel";
type RunDocumentLookup = (selection: DocumentLookupSelection) => void;
type ReportError = (error: unknown) => void;

interface DocumentLookupDialogResult {
  token: string;
  action: DialogAction;
  selection?: unknown;
}

interface DocumentLookupInitialPayload {
  token: string;
  suggestions: DocumentLookupSuggestions;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isDocumentLookupMode(value: unknown): value is DocumentLookupMode {
  return value === "oa_form_number" || value === "erp_doc_number";
}

function getStorage(root: ScrapVarianceGlobal): WpsPluginStorage {
  const storage = root.Application?.PluginStorage;
  if (!storage) {
    // 单号查询静态弹窗和主加载项之间只能通过 PluginStorage 交换 token 化结果。
    throw new Error("当前 WPS 环境不支持 PluginStorage，无法打开单号查询弹窗。");
  }
  return storage;
}

function clearDocumentLookupDialogResult(root: ScrapVarianceGlobal): void {
  getStorage(root).setItem(DOCUMENT_LOOKUP_DIALOG_RESULT_KEY, "");
}

function buildDocumentLookupInitialStateKey(token: string): string {
  return `${DOCUMENT_LOOKUP_INITIAL_STATE_KEY_PREFIX}${token}`;
}

function clearDocumentLookupInitialState(root: ScrapVarianceGlobal, token: string): void {
  const storage = getStorage(root);
  const key = buildDocumentLookupInitialStateKey(token);
  if (typeof storage.removeItem === "function") {
    storage.removeItem(key);
    return;
  }

  storage.setItem(key, "");
}

function writeDocumentLookupInitialState(
  root: ScrapVarianceGlobal,
  token: string,
  suggestions: DocumentLookupSuggestions
): void {
  const payload: DocumentLookupInitialPayload = {
    token,
    suggestions
  };
  getStorage(root).setItem(buildDocumentLookupInitialStateKey(token), JSON.stringify(payload));
}

function readDocumentLookupDialogResult(root: ScrapVarianceGlobal): DocumentLookupDialogResult | null {
  const raw = getStorage(root).getItem(DOCUMENT_LOOKUP_DIALOG_RESULT_KEY);
  if (typeof raw !== "string" || !raw.trim()) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) {
      return null;
    }
    if (typeof parsed.token !== "string" || (parsed.action !== "query" && parsed.action !== "cancel")) {
      // storage 可能残留旧弹窗结果，结构不对时忽略，不能误触发查询。
      return null;
    }

    return {
      token: parsed.token,
      action: parsed.action,
      selection: parsed.selection
    };
  } catch {
    return null;
  }
}

function normalizeDocumentLookupSelection(selection: unknown): DocumentLookupSelection | null {
  if (!isRecord(selection)) {
    return null;
  }
  if (!isDocumentLookupMode(selection.mode) || typeof selection.docNumber !== "string") {
    return null;
  }

  const docNumber = selection.docNumber.trim();
  if (!docNumber) {
    return null;
  }

  return {
    mode: selection.mode,
    docNumber
  };
}

function createDialogToken(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function buildDialogUrl(token: string): string {
  const base =
    typeof globalThis.location?.href === "string" ? globalThis.location.href : "http://127.0.0.1:3889/index.html";
  const url = new URL("ui/document-lookup-dialog.html", base);
  url.searchParams.set("token", token);
  return url.toString();
}

function buildDialogTimeoutError(): Error {
  return new Error("单号查询弹窗超时：没有收到查询或取消结果，请关闭弹窗后重试。");
}

function buildInvalidSelectionError(): Error {
  return new Error("单号查询结果无效：请重新选择单号。");
}

export function pollDocumentLookupDialogResult(
  root: ScrapVarianceGlobal,
  token: string,
  runLookup: RunDocumentLookup,
  reportError: ReportError
): boolean {
  const result = readDocumentLookupDialogResult(root);
  if (!result || result.token !== token) {
    return false;
  }

  clearDocumentLookupDialogResult(root);
  clearDocumentLookupInitialState(root, token);
  if (result.action === "cancel") {
    return true;
  }

  const selection = normalizeDocumentLookupSelection(result.selection);
  if (!selection) {
    reportError(buildInvalidSelectionError());
    return true;
  }

  try {
    runLookup(selection);
  } catch (error) {
    reportError(error);
  }
  return true;
}

export function openDocumentLookupDialogAndRun(
  root: ScrapVarianceGlobal,
  suggestions: DocumentLookupSuggestions,
  runLookup: RunDocumentLookup,
  reportError: ReportError
): void {
  getStorage(root);
  const application = root.Application;
  if (typeof application?.ShowDialog !== "function") {
    throw new Error("当前 WPS 环境不支持 ShowDialog，无法打开单号查询弹窗。");
  }

  const token = createDialogToken();
  clearDocumentLookupDialogResult(root);
  writeDocumentLookupInitialState(root, token, suggestions);
  try {
    application.ShowDialog(buildDialogUrl(token), "单号查询", 560, 300, false);
  } catch (error) {
    clearDocumentLookupDialogResult(root);
    clearDocumentLookupInitialState(root, token);
    throw error;
  }

  const startedAt = Date.now();
  const timer = globalThis.setInterval(() => {
    if (pollDocumentLookupDialogResult(root, token, runLookup, reportError)) {
      globalThis.clearInterval(timer);
      return;
    }

    if (Date.now() - startedAt >= DOCUMENT_LOOKUP_DIALOG_TIMEOUT_MS) {
      globalThis.clearInterval(timer);
      clearDocumentLookupDialogResult(root);
      clearDocumentLookupInitialState(root, token);
      reportError(buildDialogTimeoutError());
    }
  }, DOCUMENT_LOOKUP_DIALOG_POLL_MS);
}
