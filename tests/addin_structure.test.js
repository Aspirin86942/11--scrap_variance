const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const repoRoot = path.join(__dirname, "..");

function readText(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf-8");
}

function exists(relativePath) {
  return fs.existsSync(path.join(repoRoot, relativePath));
}

test("WPS add-in project files and directories exist", () => {
  assert.equal(exists("package.json"), true);
  assert.equal(exists("main.js"), true);
  assert.equal(exists("ribbon.xml"), true);
  assert.equal(exists("ribbon.js"), true);
  assert.equal(exists("src/macros"), true);
  assert.equal(exists("src/wps-api"), true);
  assert.equal(exists("src/utils"), true);
});

test("package.json exposes wpsjs dev script and test script", () => {
  const packageJson = JSON.parse(readText("package.json"));

  assert.equal(packageJson.scripts.dev, "wpsjs debug");
  assert.equal(packageJson.scripts.test, "node --test tests/*.test.js");
  assert.equal(packageJson.devDependencies.wpsjs, "^2.2.3");
});

test("main.js loads helpers, macro modules, and ribbon entrypoints", () => {
  const source = readText("main.js");

  assert.match(source, /src\/utils\/runtime\.js/);
  assert.match(source, /src\/wps-api\/runtime\.js/);
  assert.match(source, /src\/macros\/scrap-variance-precheck\.js/);
  assert.match(source, /src\/macros\/scrap-variance-query\.js/);
  assert.match(source, /ribbon\.js/);
});

test("ribbon.xml defines the scrap variance buttons", () => {
  const xml = readText("ribbon.xml");

  assert.match(xml, /报废差异工具/);
  assert.match(xml, /预验证数据/);
  assert.match(xml, /初始化查询面板/);
  assert.match(xml, /执行差异查询/);
  assert.match(xml, /id="btnPrecheck"/);
  assert.match(xml, /id="btnInitQueryPanel"/);
  assert.match(xml, /id="btnRunQuery"/);
  assert.match(xml, /onAction="ribbon\.OnAction"/);
});

test("ribbon OnAction dispatches each button through a guarded entrypoint", () => {
  const context = {
    window: {},
    calls: [],
    alerts: [],
    console,
  };
  context.window.window = context.window;
  context.window.ScrapVariancePrecheck = {
    runScrapVariancePrecheck() {
      context.calls.push("precheck");
    },
  };
  context.window.ScrapVarianceQuery = {
    setupQueryPanel() {
      context.calls.push("setup");
    },
    runScrapVarianceQuery() {
      context.calls.push("query");
    },
  };
  context.window.ScrapVarianceAddinRuntime = {
    showError(error) {
      context.alerts.push(error && error.message ? error.message : String(error));
    },
  };

  vm.createContext(context);
  vm.runInContext(readText("ribbon.js"), context, { filename: "ribbon.js" });

  assert.equal(typeof context.window.ribbon.OnAction, "function");

  context.window.ribbon.OnAction({ Id: "btnPrecheck" });
  context.window.ribbon.OnAction({ id: "btnInitQueryPanel" });
  context.window.ribbon.OnAction({ Id: "btnRunQuery" });
  context.window.ribbon.OnAction({ Id: "btnUnknown" });

  assert.deepEqual(context.calls, ["precheck", "setup", "query"]);
  assert.match(context.alerts.join("\n"), /未知功能区按钮/);
});

test("macro modules expose add-in namespaces", () => {
  const context = {
    window: {},
  };
  context.window.window = context.window;

  vm.createContext(context);
  vm.runInContext(
    readText("src/macros/scrap-variance-query.js"),
    context,
    { filename: "src/macros/scrap-variance-query.js" }
  );
  vm.runInContext(
    readText("src/macros/scrap-variance-precheck.js"),
    context,
    { filename: "src/macros/scrap-variance-precheck.js" }
  );

  assert.equal(typeof context.window.ScrapVarianceQuery.setupQueryPanel, "function");
  assert.equal(typeof context.window.ScrapVarianceQuery.runScrapVarianceQuery, "function");
  assert.equal(typeof context.window.ScrapVariancePrecheck.runScrapVariancePrecheck, "function");
});

test("WPS runtime files do not use Node-only APIs", () => {
  const runtimeFiles = [
    "main.js",
    "ribbon.js",
    "src/utils/runtime.js",
    "src/wps-api/runtime.js",
    "src/macros/scrap-variance-query.js",
    "src/macros/scrap-variance-precheck.js",
  ];
  const forbidden = /\b(?:require|process|child_process)\b|["'](?:fs|path|child_process)["']/;

  for (const file of runtimeFiles) {
    assert.doesNotMatch(readText(file), forbidden, file + " must stay browser/WPS-runtime safe");
  }
});
