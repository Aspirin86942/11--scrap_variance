/// <reference types="node" />

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildSync } from "esbuild";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(__dirname, "..", "..");

function readText(relativePath: string): string {
  return readFileSync(resolve(repoRoot, relativePath), "utf-8");
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
    expect(xml).toContain('id="btnPrecheck"');
    expect(xml).toContain('id="btnSetupOutputSheets"');
    expect(xml).toContain('id="btnQueryCurrentSheet"');
    expect(xml).toContain('id="btnToggleMaterialRows"');
    expect(xml).toContain('id="company"');
    expect(xml).toContain('id="dept1"');
    expect(xml).toContain('id="dept2"');
    expect(xml).toContain('id="startDate"');
    expect(xml).toContain('id="endDate"');
    expect(xml).toContain('id="queryDirection"');
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
    const entry = readText("src/main.ts");
    const handlers = readText("src/ribbon/handlers.ts");

    expect(source).not.toContain("ribbon handlers are not implemented yet");
    expect(source).not.toContain("加载项入口尚未完成");
    expect(source).toContain("btnPrecheck");
    expect(source).toContain("btnSetupOutputSheets");
    expect(source).toContain("btnQueryCurrentSheet");
    expect(source).toContain("btnToggleMaterialRows");
    expect(handlers).toContain("未知功能区按钮");
    expect(entry).toContain("reportRuntimeError");
  });

  it("keeps committed main.js in sync with the esbuild output", () => {
    const built = buildSync({
      entryPoints: [resolve(repoRoot, "src/main.ts")],
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
