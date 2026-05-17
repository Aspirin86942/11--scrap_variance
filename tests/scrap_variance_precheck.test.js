const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const sourcePath = path.join(
  __dirname,
  "..",
  "src",
  "macros",
  "scrap-variance-precheck.js"
);
const source = fs.readFileSync(sourcePath, "utf-8");

function loadMacroSource() {
  const context = {};

  vm.createContext(context);
  vm.runInContext(source, context, { filename: sourcePath });
  return context;
}

const macro = loadMacroSource();

function hostValue(value) {
  if (value === null || value === undefined || typeof value !== "object") {
    return value;
  }
  return JSON.parse(JSON.stringify(value));
}

function macroFunction(name) {
  return function (...args) {
    return hostValue(macro[name](...args));
  };
}

const core = {
  CONFIG: hostValue(macro.getPrecheckConfig()),
  RESULT_HEADERS: hostValue(macro.getPrecheckResultHeaders()),
  normalizeText: macroFunction("normalizeText"),
  normalizeNumber: macroFunction("normalizeNumber"),
  normalizeDateKey: macroFunction("normalizeDateKey"),
  rowsFromValues: macroFunction("rowsFromValues"),
  validateRequiredHeaders: macroFunction("validateRequiredHeaders"),
  validateDateColumn: macroFunction("validateDateColumn"),
  validateNumberColumn: macroFunction("validateNumberColumn"),
  validateRequiredCell: macroFunction("validateRequiredCell"),
  validateDuplicateKeys: macroFunction("validateDuplicateKeys"),
  collectOaFormNumbers: macroFunction("collectOaFormNumbers"),
  validateErpSourceFormExists: macroFunction("validateErpSourceFormExists"),
  buildPrecheckIssues: macroFunction("buildPrecheckIssues"),
  issueRowsToValues: macroFunction("issueRowsToValues"),
};

const runScrapVariancePrecheck = macro.runScrapVariancePrecheck;

test("WPS precheck macro source avoids syntax patterns that fail in WPS", () => {
  const trailingCommaBeforeClose = /,\s*(?:\]|\})/;

  assert.equal(
    trailingCommaBeforeClose.test(source),
    false,
    "WPS 宏编译器对旧 JS 语法更敏感，数组或对象最后一项不要保留尾随逗号"
  );
  assert.doesNotMatch(source, /^\s*\(function\b/m);
  assert.doesNotMatch(source, /^\s*"use strict";/m);
  assert.doesNotMatch(source, /^\s*(?:root\.|module\.exports|if\s*\(\s*typeof\s+module)/m);
});

test("预验证_Click delegates to runScrapVariancePrecheck for WPS button binding", () => {
  const localMacro = loadMacroSource();
  let called = false;

  localMacro.runScrapVariancePrecheck = function () {
    called = true;
  };

  assert.equal(typeof localMacro["预验证_Click"], "function");
  localMacro["预验证_Click"]();
  assert.equal(called, true);
});

test("rowsFromValues returns headers and Excel row numbers from a selected header row", () => {
  const table = core.rowsFromValues(
    [
      ["导出条件"],
      ["制表人"],
      ["表单编号", "申请日期", "数量"],
      ["CHBF1", "2026/5/1", 2],
      ["", "", ""],
    ],
    3
  );

  assert.deepEqual(table.headers, ["表单编号", "申请日期", "数量"]);
  assert.deepEqual(table.rows, [
    {
      _rowNumber: 4,
      表单编号: "CHBF1",
      申请日期: "2026/5/1",
      数量: 2,
    },
  ]);
});

test("validateRequiredHeaders reports missing columns as errors", () => {
  const issues = core.validateRequiredHeaders("OA", ["表单编号"], [
    "表单编号",
    "申请日期",
  ]);

  assert.equal(issues.length, 1);
  assert.equal(issues[0].level, "错误");
  assert.equal(issues[0].source, "OA");
  assert.equal(issues[0].fieldName, "申请日期");
  assert.equal(issues[0].issueType, "缺少关键列");
});

test("date, number, and required key validators report blocking row errors", () => {
  const rows = [
    {
      _rowNumber: 4,
      表单编号: "",
      申请日期: "2026/2/30",
      数量: "abc",
    },
  ];
  const issues = []
    .concat(core.validateRequiredCell("OA", rows, "表单编号"))
    .concat(core.validateDateColumn("OA", rows, "申请日期"))
    .concat(core.validateNumberColumn("OA", rows, "数量"));

  assert.deepEqual(
    issues.map((issue) => [
      issue.level,
      issue.rowNumber,
      issue.fieldName,
      issue.issueType,
    ]),
    [
      ["错误", 4, "表单编号", "关键字段为空"],
      ["错误", 4, "申请日期", "日期格式不正确"],
      ["错误", 4, "数量", "数值格式不正确"],
    ]
  );
});

test("duplicate OA and ERP business keys are reminders", () => {
  const oaIssues = core.validateDuplicateKeys(
    "OA",
    [
      { _rowNumber: 4, 表单编号: "CHBF1", 物料代码: "MAT-A" },
      { _rowNumber: 5, 表单编号: "CHBF1", 物料代码: "MAT-A" },
    ],
    ["表单编号", "物料代码"]
  );
  const erpIssues = core.validateDuplicateKeys(
    "ERP",
    [
      { _rowNumber: 2, 源单单号: "CHBF1", 物料编码: "MAT-A" },
      { _rowNumber: 3, 源单单号: "CHBF1", 物料编码: "MAT-A" },
    ],
    ["源单单号", "物料编码"]
  );

  assert.equal(oaIssues.length, 1);
  assert.equal(oaIssues[0].level, "提醒");
  assert.equal(oaIssues[0].rowNumber, "4,5");
  assert.equal(erpIssues.length, 1);
  assert.equal(erpIssues[0].level, "提醒");
  assert.equal(erpIssues[0].rowNumber, "2,3");
});

test("ERP source form numbers missing from full OA rows are reminders", () => {
  const oaFormNumbers = core.collectOaFormNumbers([
    { _rowNumber: 4, 表单编号: "CHBF1" },
  ]);
  const issues = core.validateErpSourceFormExists(
    [
      { _rowNumber: 2, 源单单号: "CHBF1" },
      { _rowNumber: 3, 源单单号: "CHBF999" },
      { _rowNumber: 4, 源单单号: "CHBF999" },
    ],
    oaFormNumbers
  );

  assert.equal(issues.length, 1);
  assert.equal(issues[0].level, "提醒");
  assert.equal(issues[0].fieldName, "源单单号");
  assert.equal(issues[0].rawValue, "CHBF999");
  assert.equal(issues[0].issueType, "ERP源单未在OA中找到");
});

test("buildPrecheckIssues combines row errors and reminder checks", () => {
  const oaTable = core.rowsFromValues(
    [
      ["导出条件"],
      ["制表人"],
      core.CONFIG.oaHeaders,
      ["CHBF1", "2026/5/1", "数控", "生产运营中心", "仓储部", "MAT-A", "物料A", 2, 20],
      ["CHBF1", "2026/5/1", "数控", "生产运营中心", "仓储部", "MAT-A", "物料A", 3, 30],
    ],
    3
  );
  const erpTable = core.rowsFromValues(
    [
      core.CONFIG.erpHeaders,
      ["QOUT1", "BAD_DATE", "CHBF999", "数控", "生产运营中心", "仓储部", "MAT-A", "物料A", "x", 20],
    ],
    1
  );

  const issues = core.buildPrecheckIssues(oaTable, erpTable);

  assert.equal(
    issues.some((issue) => issue.level === "错误" && issue.fieldName === "日期"),
    true
  );
  assert.equal(
    issues.some((issue) => issue.level === "错误" && issue.fieldName === "实发数量"),
    true
  );
  assert.equal(
    issues.some((issue) => issue.level === "提醒" && issue.issueType === "业务键重复"),
    true
  );
  assert.equal(
    issues.some((issue) => issue.level === "提醒" && issue.issueType === "ERP源单未在OA中找到"),
    true
  );
});

function columnNameToNumber(columnName) {
  let result = 0;

  for (const char of columnName) {
    result = result * 26 + char.charCodeAt(0) - 64;
  }

  return result;
}

function cellAddressToPosition(address) {
  const match = address.match(/^([A-Z]+)(\d+)$/);

  if (!match) {
    return null;
  }

  return {
    row: Number(match[2]),
    col: columnNameToNumber(match[1]),
  };
}

function cellKey(row, col) {
  return row + ":" + col;
}

function createFakeSheet(name, usedRangeValues, rangeValues, options) {
  const cells = new Map();
  const presetRangeValues = rangeValues || {};
  const sheetOptions = options || {};

  function writeCell(position, address, value) {
    if (position) {
      cells.set(cellKey(position.row, position.col), value);
    } else {
      presetRangeValues[address] = value;
    }
  }

  const sheet = {
    Name: name,
    UsedRange: {
      Value2: usedRangeValues,
    },
    Range(address) {
      const position = cellAddressToPosition(address);

      return {
        get Value2() {
          if (Object.prototype.hasOwnProperty.call(presetRangeValues, address)) {
            return presetRangeValues[address];
          }
          if (!position) {
            return undefined;
          }
          return cells.get(cellKey(position.row, position.col));
        },
        set Value2(value) {
          writeCell(position, address, value);
        },
        get Value() {
          return this.Value2;
        },
        set Value(value) {
          if (sheetOptions.valuePropertyReadOnly) {
            throw new Error('"Value"只读');
          }
          writeCell(position, address, value);
        },
        ClearContents() {
          cells.clear();
        },
      };
    },
    Cells: {
      Item(row, col) {
        return {
          get Value2() {
            return cells.get(cellKey(row, col));
          },
          set Value2(value) {
            cells.set(cellKey(row, col), value);
          },
          get Value() {
            return cells.get(cellKey(row, col));
          },
          set Value(value) {
            if (sheetOptions.valuePropertyReadOnly) {
              throw new Error('"Value"只读');
            }
            cells.set(cellKey(row, col), value);
          },
        };
      },
    },
    writtenValues() {
      return Array.from(cells.values());
    },
  };

  return sheet;
}

function createFakeApplication(sheets) {
  const sheetList = sheets.slice();
  const collection = {
    get Count() {
      return sheetList.length;
    },
    Item(index) {
      return sheetList[index - 1];
    },
    Add() {
      const sheet = createFakeSheet("Sheet" + (sheetList.length + 1), []);
      sheetList.push(sheet);
      return sheet;
    },
  };

  return {
    ActiveWorkbook: {
      Worksheets: collection,
    },
    sheetByName(name) {
      return sheetList.find((sheet) => sheet.Name === name);
    },
  };
}

test("runScrapVariancePrecheck writes reminders to 预验证结果 through Value2", () => {
  const previousApplication = macro.Application;
  const readOnlyValue = { valuePropertyReadOnly: true };
  const oaSheet = createFakeSheet(
    "查询OA-存货报废申请单",
    [
      ["导出条件"],
      ["制表人"],
      core.CONFIG.oaHeaders,
      ["CHBF1", "2026/5/1", "数控", "生产运营中心", "仓储部", "MAT-A", "物料A", 2, 20],
      ["CHBF1", "2026/5/1", "数控", "生产运营中心", "仓储部", "MAT-A", "物料A", 3, 30],
    ],
    null,
    readOnlyValue
  );
  const erpSheet = createFakeSheet(
    "查询ERP-报废明细表",
    [
      core.CONFIG.erpHeaders,
      ["QOUT1", "2026/5/2", "CHBF999", "数控", "生产运营中心", "仓储部", "MAT-A", "物料A", 5, 50],
    ],
    null,
    readOnlyValue
  );
  const fakeApplication = createFakeApplication([oaSheet, erpSheet]);

  try {
    macro.Application = fakeApplication;

    runScrapVariancePrecheck();

    const resultSheet = fakeApplication.sheetByName("预验证结果");
    const output = resultSheet.writtenValues().map(String).join("\n");
    assert.match(output, /报废差异预验证/);
    assert.match(output, /提醒/);
    assert.match(output, /业务键重复/);
    assert.match(output, /ERP源单未在OA中找到/);
  } finally {
    if (previousApplication === undefined) {
      delete macro.Application;
    } else {
      macro.Application = previousApplication;
    }
  }
});
