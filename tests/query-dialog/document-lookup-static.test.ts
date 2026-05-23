/// <reference types="node" />

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(__dirname, "..", "..");

type Listener = (event: { preventDefault(): void; target?: FakeElement }) => void;
type WindowListener = () => void;

interface DocumentLookupSuggestion {
  label: string;
  docNumber: string;
}

interface LoadOptions {
  getItemThrows?: boolean;
  setItemThrows?: boolean;
  storageUnavailable?: boolean;
}

interface DialogHarness {
  alerts: string[];
  document: FakeDocument;
  getCloseCount(): number;
  hooks: DocumentLookupHooks;
  runTimeouts(): void;
  runWindowEvent(type: string): void;
  storage: Map<string, string>;
}

class FakeElement {
  public id = "";
  public name = "";
  public value = "";
  public checked = false;
  public disabled = false;
  public className = "";
  public textContent = "";
  public parentNode: FakeElement | null = null;
  public children: FakeElement[] = [];
  public style: Record<string, string> = {};
  private readonly attributes = new Map<string, string>();
  private readonly listeners = new Map<string, Listener[]>();

  constructor(public readonly tagName: string) {}

  appendChild(child: FakeElement): FakeElement {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  removeChild(child: FakeElement): void {
    this.children = this.children.filter((item) => item !== child);
    child.parentNode = null;
  }

  addEventListener(type: string, listener: Listener): void {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  dispatchEvent(type: string): void {
    const event = {
      preventDefault() {},
      target: this
    };
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }

  getAttribute(name: string): string | undefined {
    return this.attributes.get(name);
  }

  getBoundingClientRect(): { left: number; top: number; bottom: number; width: number } {
    return { left: 10, top: 20, bottom: 50, width: 180 };
  }
}

class FakeDocument {
  public readonly body = new FakeElement("body");
  private readonly elements = new Map<string, FakeElement>();
  private readonly modeInputs: FakeElement[] = [];

  constructor() {
    this.register("lookupForm", new FakeElement("form"));
    this.register("documentKeyword", this.makeTextInput("documentKeyword"));
    this.register("btnClear", new FakeElement("button"));
    this.register("btnCancel", new FakeElement("button"));

    const oaMode = this.makeModeInput("oa_form_number", true);
    const erpMode = this.makeModeInput("erp_doc_number", false);
    this.modeInputs.push(oaMode, erpMode);
  }

  createElement(tagName: string): FakeElement {
    return new FakeElement(tagName);
  }

  getElementById(id: string): FakeElement | null {
    return this.elements.get(id) ?? null;
  }

  querySelectorAll(selector: string): FakeElement[] {
    if (selector === 'input[name="lookupMode"]') {
      return this.modeInputs;
    }
    return [];
  }

  getLastDropdown(): FakeElement {
    const dropdown = this.body.children[this.body.children.length - 1];
    if (!dropdown) {
      throw new Error("expected lookup dropdown to be appended");
    }
    return dropdown;
  }

  modeInput(value: string): FakeElement {
    const input = this.modeInputs.find((item) => item.value === value);
    if (!input) {
      throw new Error(`expected mode input ${value}`);
    }
    return input;
  }

  private register(id: string, element: FakeElement): FakeElement {
    element.id = id;
    this.elements.set(id, element);
    return element;
  }

  private makeTextInput(id: string): FakeElement {
    const input = new FakeElement("input");
    input.id = id;
    return input;
  }

  private makeModeInput(value: string, checked: boolean): FakeElement {
    const input = new FakeElement("input");
    input.name = "lookupMode";
    input.value = value;
    input.checked = checked;
    return input;
  }
}

interface DocumentLookupHooks {
  getMatchedSuggestions(value: string, suggestions: DocumentLookupSuggestion[]): DocumentLookupSuggestion[];
}

function loadDocumentLookupDialog(initialPayload?: unknown, options: LoadOptions = {}): DialogHarness {
  const document = new FakeDocument();
  const storage = new Map<string, string>();
  const alerts: string[] = [];
  const hooks = {} as DocumentLookupHooks;
  const timeoutCallbacks: Array<() => void> = [];
  const windowListeners = new Map<string, WindowListener[]>();
  let closeCount = 0;

  if (initialPayload) {
    storage.set("ScrapVarianceDocumentLookupInitialState:test-token", JSON.stringify(initialPayload));
  }

  const pluginStorage = {
    getItem(key: string): string | undefined {
      if (options.getItemThrows) {
        throw new Error("getItem failed");
      }
      return storage.get(key);
    },
    setItem(key: string, value: string): void {
      if (options.setItemThrows) {
        throw new Error("setItem failed");
      }
      storage.set(key, value);
    }
  };

  const windowObject = {
    __SCRAP_VARIANCE_DOCUMENT_LOOKUP_DIALOG_TESTS__: hooks,
    addEventListener(type: string, listener: WindowListener): void {
      const listeners = windowListeners.get(type) ?? [];
      listeners.push(listener);
      windowListeners.set(type, listeners);
    },
    close() {
      closeCount += 1;
    },
    location: { search: "?token=test-token" },
    pageXOffset: 0,
    pageYOffset: 0,
    setTimeout(callback: () => void): number {
      timeoutCallbacks.push(callback);
      return timeoutCallbacks.length;
    }
  } as {
    Application?: { PluginStorage: typeof pluginStorage };
    __SCRAP_VARIANCE_DOCUMENT_LOOKUP_DIALOG_TESTS__: DocumentLookupHooks;
    addEventListener(type: string, listener: WindowListener): void;
    close(): void;
    location: { search: string };
    pageXOffset: number;
    pageYOffset: number;
    setTimeout(callback: () => void): number;
  };
  if (!options.storageUnavailable) {
    windowObject.Application = { PluginStorage: pluginStorage };
  }
  const context = vm.createContext({
    alert(message: string) {
      alerts.push(message);
    },
    document,
    window: windowObject
  });

  vm.runInContext(readFileSync(resolve(repoRoot, "ui/document-lookup-dialog.js"), "utf-8"), context);

  return {
    alerts,
    document,
    getCloseCount() {
      return closeCount;
    },
    hooks,
    runTimeouts() {
      while (timeoutCallbacks.length > 0) {
        timeoutCallbacks.shift()?.();
      }
    },
    runWindowEvent(type: string) {
      for (const listener of windowListeners.get(type) ?? []) {
        listener();
      }
    },
    storage
  };
}

describe("static document lookup dialog", () => {
  it("filters matched suggestions by substring", () => {
    const { hooks } = loadDocumentLookupDialog();

    expect(
      hooks.getMatchedSuggestions("001", [
        { label: "OA 报废申请 OA-001", docNumber: "OA-001" },
        { label: "ERP 入库单", docNumber: "ERP-001" },
        { label: "OA 报废申请 OA-002", docNumber: "OA-002" }
      ])
    ).toEqual([
      { label: "OA 报废申请 OA-001", docNumber: "OA-001" },
      { label: "ERP 入库单", docNumber: "ERP-001" }
    ]);
  });

  it("rejects submit when keyword matches text but no candidate was selected", () => {
    const { alerts, document, storage } = loadDocumentLookupDialog({
      token: "test-token",
      suggestions: {
        oa: [{ label: "OA 报废申请 OA-001", docNumber: "OA-001" }],
        erp: []
      }
    });
    const input = document.getElementById("documentKeyword");
    const form = document.getElementById("lookupForm");
    if (!input || !form) {
      throw new Error("expected lookup form fields");
    }

    input.value = "OA-001";
    form.dispatchEvent("submit");

    expect(alerts).toEqual(["请先从下拉候选中选择一个单号。"]);
    expect(storage.has("ScrapVarianceDocumentLookupDialogResult")).toBe(false);
  });

  it("writes query result with selected mode and docNumber after choosing a candidate", () => {
    const { document, storage } = loadDocumentLookupDialog({
      token: "test-token",
      suggestions: {
        oa: [
          { label: "OA 报废申请 OA-001", docNumber: "OA-001" },
          { label: "OA 报废申请 OA-002", docNumber: "OA-002" }
        ],
        erp: [{ label: "ERP 报废单 ERP-001", docNumber: "ERP-001" }]
      }
    });
    const input = document.getElementById("documentKeyword");
    const form = document.getElementById("lookupForm");
    if (!input || !form) {
      throw new Error("expected lookup form fields");
    }

    input.value = "001";
    input.dispatchEvent("input");

    const dropdown = document.getLastDropdown();
    expect(dropdown.children.map((child) => child.textContent)).toEqual(["OA 报废申请 OA-001"]);

    dropdown.children[0]?.dispatchEvent("mousedown");
    form.dispatchEvent("submit");

    const result = JSON.parse(String(storage.get("ScrapVarianceDocumentLookupDialogResult")));
    expect(result).toEqual({
      token: "test-token",
      action: "query",
      selection: {
        mode: "oa_form_number",
        docNumber: "OA-001"
      }
    });
    expect(Object.keys(result.selection).sort()).toEqual(["docNumber", "mode"]);
  });

  it("keeps current mode and clears input when Clear is clicked", () => {
    const { alerts, document, storage } = loadDocumentLookupDialog({
      token: "test-token",
      suggestions: {
        oa: [{ label: "OA 报废申请 OA-001", docNumber: "OA-001" }],
        erp: [{ label: "ERP 报废单 ERP-001", docNumber: "ERP-001" }]
      }
    });
    const input = document.getElementById("documentKeyword");
    const clear = document.getElementById("btnClear");
    const form = document.getElementById("lookupForm");
    const oaMode = document.modeInput("oa_form_number");
    const erpMode = document.modeInput("erp_doc_number");
    if (!input || !clear || !form) {
      throw new Error("expected lookup form controls");
    }

    oaMode.checked = false;
    erpMode.checked = true;
    input.value = "ERP";
    input.dispatchEvent("input");
    document.getLastDropdown().children[0]?.dispatchEvent("mousedown");

    clear.dispatchEvent("click");
    form.dispatchEvent("submit");

    expect(erpMode.checked).toBe(true);
    expect(oaMode.checked).toBe(false);
    expect(input.value).toBe("");
    expect(alerts).toEqual(["请先从下拉候选中选择一个单号。"]);
    expect(storage.has("ScrapVarianceDocumentLookupDialogResult")).toBe(false);
  });

  it("writes cancel on beforeunload when no result was submitted", () => {
    const { runWindowEvent, storage } = loadDocumentLookupDialog({
      token: "test-token",
      suggestions: {
        oa: [{ label: "OA 报废申请 OA-001", docNumber: "OA-001" }],
        erp: []
      }
    });

    runWindowEvent("beforeunload");

    expect(JSON.parse(String(storage.get("ScrapVarianceDocumentLookupDialogResult")))).toEqual({
      token: "test-token",
      action: "cancel",
      selection: null
    });
  });

  it("clears keyword on mode change while keeping the new mode selected", () => {
    const { alerts, document, storage } = loadDocumentLookupDialog({
      token: "test-token",
      suggestions: {
        oa: [{ label: "OA 报废申请 OA-001", docNumber: "OA-001" }],
        erp: [{ label: "ERP 报废单 ERP-001", docNumber: "ERP-001" }]
      }
    });
    const input = document.getElementById("documentKeyword");
    const form = document.getElementById("lookupForm");
    const oaMode = document.modeInput("oa_form_number");
    const erpMode = document.modeInput("erp_doc_number");
    if (!input || !form) {
      throw new Error("expected lookup form controls");
    }

    input.value = "OA";
    input.dispatchEvent("input");
    oaMode.checked = false;
    erpMode.checked = true;
    erpMode.dispatchEvent("change");
    input.value = "ERP-001";
    form.dispatchEvent("submit");

    expect(input.value).toBe("ERP-001");
    expect(erpMode.checked).toBe(true);
    expect(oaMode.checked).toBe(false);
    expect(alerts).toEqual(["请先从下拉候选中选择一个单号。"]);
    expect(storage.has("ScrapVarianceDocumentLookupDialogResult")).toBe(false);
  });

  it("keeps a blurred candidate selectable until the deferred hide runs", () => {
    const { document, runTimeouts, storage } = loadDocumentLookupDialog({
      token: "test-token",
      suggestions: {
        oa: [{ label: "OA 报废申请 OA-001", docNumber: "OA-001" }],
        erp: []
      }
    });
    const input = document.getElementById("documentKeyword");
    const form = document.getElementById("lookupForm");
    if (!input || !form) {
      throw new Error("expected lookup form controls");
    }

    input.value = "001";
    input.dispatchEvent("input");
    const dropdown = document.getLastDropdown();

    input.dispatchEvent("blur");
    dropdown.children[0]?.dispatchEvent("mousedown");
    runTimeouts();
    form.dispatchEvent("submit");

    expect(JSON.parse(String(storage.get("ScrapVarianceDocumentLookupDialogResult")))).toEqual({
      token: "test-token",
      action: "query",
      selection: {
        mode: "oa_form_number",
        docNumber: "OA-001"
      }
    });
  });

  it("ignores initial suggestions when PluginStorage getItem fails", () => {
    const { document, hooks } = loadDocumentLookupDialog(
      {
        token: "test-token",
        suggestions: {
          oa: [{ label: "OA 报废申请 OA-001", docNumber: "OA-001" }],
          erp: []
        }
      },
      { getItemThrows: true }
    );
    const input = document.getElementById("documentKeyword");
    if (!input) {
      throw new Error("expected lookup input");
    }

    input.value = "001";
    input.dispatchEvent("focus");

    const dropdown = document.getLastDropdown();
    expect(dropdown.children).toHaveLength(0);
    expect(dropdown.style.display).not.toBe("block");
    expect(hooks.getMatchedSuggestions("001", [])).toEqual([]);
  });

  it("alerts once when PluginStorage is unavailable during cancel", () => {
    const { alerts, document, getCloseCount, storage } = loadDocumentLookupDialog(undefined, {
      storageUnavailable: true
    });
    const cancel = document.getElementById("btnCancel");
    if (!cancel) {
      throw new Error("expected cancel button");
    }

    cancel.dispatchEvent("click");

    expect(alerts).toEqual(["当前 WPS 环境不支持 PluginStorage，无法提交查询。"]);
    expect(storage.has("ScrapVarianceDocumentLookupDialogResult")).toBe(false);
    expect(getCloseCount()).toBe(0);
  });

  it("alerts once and keeps dialog open when PluginStorage setItem fails during submit", () => {
    const { alerts, document, getCloseCount, storage } = loadDocumentLookupDialog(
      {
        token: "test-token",
        suggestions: {
          oa: [{ label: "OA 报废申请 OA-001", docNumber: "OA-001" }],
          erp: []
        }
      },
      { setItemThrows: true }
    );
    const input = document.getElementById("documentKeyword");
    const form = document.getElementById("lookupForm");
    if (!input || !form) {
      throw new Error("expected lookup form controls");
    }

    input.value = "001";
    input.dispatchEvent("input");
    document.getLastDropdown().children[0]?.dispatchEvent("mousedown");
    form.dispatchEvent("submit");

    expect(alerts).toEqual(["单号查询结果写入失败，请关闭后重试。"]);
    expect(storage.has("ScrapVarianceDocumentLookupDialogResult")).toBe(false);
    expect(getCloseCount()).toBe(0);
  });

  it("ignores PluginStorage setItem failures during beforeunload", () => {
    const { alerts, getCloseCount, runWindowEvent, storage } = loadDocumentLookupDialog(
      {
        token: "test-token",
        suggestions: {
          oa: [{ label: "OA 报废申请 OA-001", docNumber: "OA-001" }],
          erp: []
        }
      },
      { setItemThrows: true }
    );

    runWindowEvent("beforeunload");

    expect(alerts).toEqual([]);
    expect(storage.has("ScrapVarianceDocumentLookupDialogResult")).toBe(false);
    expect(getCloseCount()).toBe(0);
  });
});
