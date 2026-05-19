/// <reference types="node" />

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(__dirname, "..", "..");

type Listener = (event: { preventDefault(): void; target?: FakeElement }) => void;

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
  private readonly directionInputs: FakeElement[] = [];

  constructor() {
    this.register("queryForm", new FakeElement("form"));
    this.register("company", this.makeTextInput("company"));
    this.register("dept1", this.makeTextInput("dept1"));
    this.register("dept2", this.makeTextInput("dept2"));
    this.register("startDate", this.makeTextInput("startDate"));
    this.register("endDate", this.makeTextInput("endDate"));
    this.register("queryDirectionGroup", new FakeElement("fieldset"));
    this.register("btnClear", new FakeElement("button"));
    this.register("btnCancel", new FakeElement("button"));

    const defaultDirection = this.makeDirectionInput("OA金蝶单号查ERP", true);
    const reverseDirection = this.makeDirectionInput("ERP源单查OA", false);
    this.directionInputs.push(defaultDirection, reverseDirection);
  }

  createElement(tagName: string): FakeElement {
    return new FakeElement(tagName);
  }

  getElementById(id: string): FakeElement | null {
    return this.elements.get(id) ?? null;
  }

  querySelectorAll(selector: string): FakeElement[] {
    if (selector === 'input[name="queryDirection"]') {
      return this.directionInputs;
    }
    return [];
  }

  getLastDropdown(): FakeElement {
    const dropdown = this.body.children[this.body.children.length - 1];
    if (!dropdown) {
      throw new Error("expected autocomplete dropdown to be appended");
    }
    return dropdown;
  }

  getAutocompleteDropdowns(): FakeElement[] {
    return this.body.children.filter((child) => child.className === "autocomplete-menu");
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

  private makeDirectionInput(value: string, checked: boolean): FakeElement {
    const input = new FakeElement("input");
    input.name = "queryDirection";
    input.value = value;
    input.checked = checked;
    return input;
  }
}

interface QueryDialogHooks {
  normalizeSuggestions(input: unknown): string[];
  getMatchedOptions(value: string, suggestions: string[]): string[];
  attachAutocomplete(inputId: string, suggestions: string[]): void;
}

function loadQueryDialog(initialPayload?: unknown): {
  document: FakeDocument;
  hooks: QueryDialogHooks;
  storage: Map<string, string>;
  runTimeouts(): void;
} {
  const document = new FakeDocument();
  const storage = new Map<string, string>();
  const hooks = {} as QueryDialogHooks;
  const timeoutCallbacks: Array<() => void> = [];
  if (initialPayload) {
    storage.set("ScrapVarianceQueryDialogInitialState:test-token", JSON.stringify(initialPayload));
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
    __SCRAP_VARIANCE_QUERY_DIALOG_TESTS__: hooks,
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
    alert() {},
    document,
    window: windowObject
  });

  vm.runInContext(readFileSync(resolve(repoRoot, "ui/query-dialog.js"), "utf-8"), context);

  return {
    document,
    hooks,
    storage,
    runTimeouts() {
      while (timeoutCallbacks.length > 0) {
        timeoutCallbacks.shift()?.();
      }
    }
  };
}

describe("static query dialog autocomplete", () => {
  it("normalizes suggestions by trimming, dropping blanks, and deduplicating", () => {
    const { hooks } = loadQueryDialog();

    expect(hooks.normalizeSuggestions([" 数控 ", "", "数控", null, "装备", "  "])).toEqual(["数控", "装备"]);
  });

  it("matches suggestions by substring and caps visible options at 30", () => {
    const { hooks } = loadQueryDialog();
    const suggestions = Array.from({ length: 35 }, (_, index) => `生产部门${index + 1}`);

    expect(hooks.getMatchedOptions("部门", suggestions)).toHaveLength(30);
    expect(hooks.getMatchedOptions("产部", suggestions).slice(0, 2)).toEqual(["生产部门1", "生产部门2"]);
    expect(hooks.getMatchedOptions("无匹配", suggestions)).toEqual([]);
  });

  it("fills the input when a suggestion is clicked while preserving free text behavior", () => {
    const { document, hooks } = loadQueryDialog();
    const input = document.getElementById("company");
    if (!input) {
      throw new Error("expected company input");
    }

    hooks.attachAutocomplete("company", ["数控", "装备", "售后"]);
    input.value = "装";
    input.dispatchEvent("input");

    const dropdown = document.getLastDropdown();
    expect(dropdown.children.map((child) => child.textContent)).toEqual(["装备"]);

    dropdown.children[0]?.dispatchEvent("mousedown");

    expect(input.value).toBe("装备");
    expect(dropdown.children).toHaveLength(0);
  });

  it("renders autocomplete suggestions from the tokenized initial payload", () => {
    const { document, storage } = loadQueryDialog({
      token: "test-token",
      suggestions: {
        company: ["数控", "装备"],
        dept1: ["生产", "售后"],
        dept2: ["仓储", "维修"]
      }
    });
    const company = document.getElementById("company");
    const dept1 = document.getElementById("dept1");
    const form = document.getElementById("queryForm");
    if (!company || !dept1 || !form) {
      throw new Error("expected query form fields");
    }

    company.value = "装";
    company.dispatchEvent("focus");
    const companyDropdown = document.getAutocompleteDropdowns()[0];
    expect(companyDropdown?.children.map((child) => child.textContent)).toEqual(["装备"]);

    dept1.value = "售";
    dept1.dispatchEvent("focus");
    const dept1Dropdown = document.getAutocompleteDropdowns()[1];
    expect(companyDropdown?.style.display).toBe("none");
    expect(dept1Dropdown?.children.map((child) => child.textContent)).toEqual(["售后"]);

    company.value = "自由公司";
    form.dispatchEvent("submit");

    expect(JSON.parse(String(storage.get("ScrapVarianceQueryDialogResult")))).toMatchObject({
      token: "test-token",
      action: "query",
      state: {
        company: "自由公司"
      }
    });
  });

  it("hides the dropdown after blur via window.setTimeout", () => {
    const { document, hooks, runTimeouts } = loadQueryDialog();
    const input = document.getElementById("company");
    if (!input) {
      throw new Error("expected company input");
    }

    hooks.attachAutocomplete("company", ["数控", "装备"]);
    input.value = "数";
    input.dispatchEvent("focus");

    const dropdown = document.getLastDropdown();
    expect(dropdown.style.display).toBe("block");

    input.dispatchEvent("blur");
    expect(dropdown.style.display).toBe("block");

    runTimeouts();

    expect(dropdown.style.display).toBe("none");
    expect(dropdown.children).toHaveLength(0);
  });

  it("hides the previous autocomplete dropdown when another field opens", () => {
    const { document, hooks } = loadQueryDialog();
    const company = document.getElementById("company");
    const dept1 = document.getElementById("dept1");
    if (!company || !dept1) {
      throw new Error("expected autocomplete inputs");
    }

    hooks.attachAutocomplete("company", ["数控", "装备"]);
    hooks.attachAutocomplete("dept1", ["生产", "售后"]);
    const dropdowns = document.getAutocompleteDropdowns();
    const companyDropdown = dropdowns[dropdowns.length - 2];
    const dept1Dropdown = dropdowns[dropdowns.length - 1];
    if (!companyDropdown || !dept1Dropdown) {
      throw new Error("expected two attached dropdowns");
    }

    company.value = "数";
    company.dispatchEvent("focus");
    expect(companyDropdown.style.display).toBe("block");

    dept1.value = "生";
    dept1.dispatchEvent("focus");

    expect(companyDropdown.style.display).toBe("none");
    expect(dept1Dropdown.style.display).toBe("block");
    expect(dept1Dropdown.children.map((child) => child.textContent)).toEqual(["生产"]);
  });

  it("does not show an empty dropdown shell when there are no suggestions", () => {
    const { document, hooks } = loadQueryDialog();
    const input = document.getElementById("company");
    if (!input) {
      throw new Error("expected company input");
    }

    hooks.attachAutocomplete("company", []);
    input.value = "自由输入";
    input.dispatchEvent("focus");
    input.dispatchEvent("input");

    const dropdown = document.getLastDropdown();
    expect(dropdown.style.display).not.toBe("block");
    expect(dropdown.children).toHaveLength(0);
  });
});
