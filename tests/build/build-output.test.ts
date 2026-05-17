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
    expect(xml).toContain('id="btnInitQueryPanel"');
    expect(xml).toContain('id="btnRunQuery"');
  });

  it("generated main.js is a bundle and does not document.write source files", () => {
    const source = readText("main.js");

    expect(source).not.toContain("document.write");
    expect(source).not.toContain("src/macros/scrap-variance-query.js");
    expect(source).not.toContain("ribbon.js");
    expect(source).toContain("ribbon");
  });

  it("uses a safe placeholder report instead of throwing from the ribbon action", () => {
    const source = readText("main.js");
    const entry = readText("src/main.ts");

    expect(source).not.toContain("ribbon handlers are not implemented yet");
    expect(source).not.toContain("throw new Error");
    expect(source).toContain("reportPlaceholder");
    expect(entry).toContain("加载项入口尚未完成");
  });

  it("keeps committed main.js in sync with the esbuild output", () => {
    const built = buildSync({
      entryPoints: [resolve(repoRoot, "src/main.ts")],
      bundle: true,
      format: "iife",
      target: "es2018",
      write: false
    });

    expect(built.outputFiles[0]?.text).toBe(readText("main.js"));
  });
});
