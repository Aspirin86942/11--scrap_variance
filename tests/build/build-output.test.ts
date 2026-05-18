/// <reference types="node" />

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildSync } from "esbuild";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(__dirname, "..", "..");

function readText(relativePath: string): string {
  return readFileSync(resolve(repoRoot, relativePath), "utf-8");
}

function normalizeJsContinuedLines(source: string): string {
  return source.replace(/\\\r?\n/g, "");
}

describe("WPS add-in generated bundle", () => {
  it("keeps index.html pointed at the generated root main.js", () => {
    const html = readText("index.html");

    expect(html).toContain('<meta charset="utf-8">');
    expect(html).toContain('src="./main.js"');
  });

  it("keeps ribbon.xml pointed at the bundled ribbon object", () => {
    const xml = readText("ribbon.xml");

    expect(xml).toContain('onLoad="ribbon.OnAddinLoad"');
    expect(xml).toContain('onAction="ribbon.OnAction"');
    expect(xml).not.toContain("<editBox");
    expect(xml).not.toContain("<dropDown");
    expect(xml).not.toContain('id="company"');
    expect(xml).not.toContain('id="dept1"');
    expect(xml).not.toContain('id="dept2"');
    expect(xml).not.toContain('id="startDate"');
    expect(xml).not.toContain('id="endDate"');
    expect(xml).not.toContain('id="queryDirection"');
    expect(xml).toContain('id="btnPrecheck"');
    expect(xml).toContain('id="btnSetupOutputSheets"');
    expect(xml).toContain('id="btnQueryCurrentSheet"');
    expect(xml).toContain('id="btnToggleMaterialRows"');
  });

  it("ships the static query dialog page", () => {
    const html = readText("ui/query-dialog.html");
    const script = readText("ui/query-dialog.js");

    expect(html).toContain('id="company"');
    expect(html).toContain('id="dept1"');
    expect(html).toContain('id="dept2"');
    expect(html).toContain('id="startDate"');
    expect(html).toContain('id="endDate"');
    expect(html).toContain('id="queryDirection"');
    expect(html).toContain('id="btnQuery"');
    expect(html).toContain('id="btnClear"');
    expect(html).toContain('id="btnCancel"');
    expect(html).toContain('src="./query-dialog.js"');
    expect(script).toContain("ScrapVarianceQueryDialogResult");
    expect(script).toContain("OA金蝶单号查ERP");
    expect(script).toContain("ERP源单查OA");
  });

  it("registers every ribbon onAction callback through the WPS entrypoint", () => {
    const xml = readText("ribbon.xml");
    const entry = readText("src/entry.ts");
    const types = readText("src/types/wps.ts");
    const actions = [...xml.matchAll(/onAction="ribbon\.([A-Za-z0-9_]+)"/g)].map((match) => match[1]);

    expect(actions.length).toBeGreaterThan(0);
    expect(new Set(actions)).toEqual(new Set(["OnAction"]));
    expect(entry).toContain("root.ribbon = createWpsRibbon");
    expect(entry).toContain("root.buttonActions = buttonActions");
    expect(entry).toContain("root.__WPS_RUN_ALL_BUTTON_TESTS__");
    for (const action of actions) {
      expect(types).toContain(`${action}(control: RibbonControl): void`);
    }
  });

  it("generated main.js is a bundle and does not document.write source files", () => {
    const source = readText("main.js");

    expect(source).not.toContain("document.write");
    expect(source).not.toContain("src/macros");
    expect(source).not.toContain("src/macros/scrap-variance-query.js");
    expect(source).not.toContain("ribbon.js");
    expect(source).not.toContain("require(");
    expect(source).not.toContain("process.");
    expect(source).toContain("ribbon");
  });

  it("bundles the real ribbon handlers instead of the temporary placeholder", () => {
    const source = readText("main.js");
    const searchableSource = normalizeJsContinuedLines(source);
    const entry = readText("src/entry.ts");
    const main = readText("src/main.ts");
    const handlers = readText("src/ribbon/handlers.ts");
    const actions = readText("src/actions/button-actions.ts");

    expect(searchableSource).not.toContain("ribbon handlers are not implemented yet");
    expect(searchableSource).not.toContain("加载项入口尚未完成");
    expect(searchableSource).toContain("btnPrecheck");
    expect(searchableSource).toContain("btnSetupOutputSheets");
    expect(searchableSource).toContain("btnQueryCurrentSheet");
    expect(searchableSource).toContain("btnToggleMaterialRows");
    expect(searchableSource).toContain("__WPS_RUN_ALL_BUTTON_TESTS__");
    expect(handlers).toContain("getButtonAction");
    expect(actions).toContain("未知功能区按钮");
    expect(entry).toContain("root.buttonActions");
    expect(main).toContain("createDefaultButtonActions");
  });

  it("keeps committed main.js in sync with the esbuild output", () => {
    const built = buildSync({
      entryPoints: [resolve(repoRoot, "src/entry.ts")],
      bundle: true,
      format: "iife",
      legalComments: "none",
      lineLimit: 160,
      mainFields: ["module", "main"],
      minifyWhitespace: true,
      target: "es2018",
      write: false
    });

    expect(built.outputFiles[0]?.text).toBe(readText("main.js"));
  });
});
