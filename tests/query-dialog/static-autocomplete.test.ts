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

function loadQueryDialog(): { document: FakeDocument; hooks: QueryDialogHooks } {
  const document = new FakeDocument();
  const storage = new Map<string, string>();
  const hooks = {} as QueryDialogHooks;
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
    pageYOffset: 0
  };
  const context = vm.createContext({
    alert() {},
    document,
    window: windowObject
  });

  vm.runInContext(readFileSync(resolve(repoRoot, "ui/query-dialog.js"), "utf-8"), context);

  return { document, hooks };
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
});
