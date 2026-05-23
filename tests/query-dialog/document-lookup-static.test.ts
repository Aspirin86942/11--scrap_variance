/// <reference types="node" />

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(__dirname, "..", "..");

type Listener = (event: { preventDefault(): void; target?: FakeElement }) => void;

interface DocumentLookupSuggestion {
  label: string;
  docNumber: string;
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

function loadDocumentLookupDialog(initialPayload?: unknown): {
  alerts: string[];
  document: FakeDocument;
  hooks: DocumentLookupHooks;
  storage: Map<string, string>;
} {
  const document = new FakeDocument();
  const storage = new Map<string, string>();
  const alerts: string[] = [];
  const hooks = {} as DocumentLookupHooks;
  const timeoutCallbacks: Array<() => void> = [];

  if (initialPayload) {
    storage.set("ScrapVarianceDocumentLookupInitialState:test-token", JSON.stringify(initialPayload));
  }

  const windowObject = {
    Application: {
      PluginStorage: {
        getItem(key: string): string | undefined {
          return storage.get(key);
        },
        setItem(key: string, value: string): void {
          storage.set(key, value);
        }
      }
    },
    __SCRAP_VARIANCE_DOCUMENT_LOOKUP_DIALOG_TESTS__: hooks,
    addEventListener() {},
    close() {},
    location: { search: "?token=test-token" },
    pageXOffset: 0,
    pageYOffset: 0,
    setTimeout(callback: () => void): number {
      timeoutCallbacks.push(callback);
      return timeoutCallbacks.length;
    }
  };
  const context = vm.createContext({
    alert(message: string) {
      alerts.push(message);
    },
    document,
    window: windowObject
  });

  vm.runInContext(readFileSync(resolve(repoRoot, "ui/document-lookup-dialog.js"), "utf-8"), context);

  while (timeoutCallbacks.length > 0) {
    timeoutCallbacks.shift()?.();
  }

  return { alerts, document, hooks, storage };
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
});
