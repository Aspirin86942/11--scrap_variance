function getOaRequiredHeaders() {
  return [
    "表单编号",
    "申请日期",
    "公司简称",
    "一级部门",
    "二级部门",
    "物料代码",
    "物料名称",
    "数量",
    "实际预算金额mx"
  ];
}

function getErpRequiredHeaders() {
  return [
    "单据编号",
    "日期",
    "源单单号",
    "区分公司简称",
    "一级部门",
    "二级部门",
    "物料编码",
    "物料名称",
    "实发数量",
    "总成本"
  ];
}

function getPrecheckResultHeaders() {
  return [
    "级别",
    "数据源",
    "行号",
    "字段名",
    "原值",
    "问题类型",
    "原因",
    "处理建议"
  ];
}

function getPrecheckConfig() {
  return {
    sheets: {
      oa: "查询OA-存货报废申请单",
      erp: "查询ERP-报废明细表",
      result: "预验证结果"
    },
    oaHeaderRow: 3,
    erpHeaderRow: 1,
    oaHeaders: getOaRequiredHeaders(),
    erpHeaders: getErpRequiredHeaders()
  };
}

function normalizeText(value) {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value).trim();
}

function isArray(value) {
  return Object.prototype.toString.call(value) === "[object Array]";
}

function normalizeMatrix(values) {
  if (isArray(values)) {
    if (values.length === 0) {
      return [];
    }
    if (isArray(values[0])) {
      return values;
    }
    return [values];
  }
  return [[values]];
}

function isBlankValue(value) {
  return value === null || value === undefined || normalizeText(value) === "";
}

function normalizeNumber(value) {
  var text;
  var numberValue;
  var plainNumericPattern = /^[-+]?(?:\d+|\d*\.\d+)$/;
  var commaNumericPattern = /^[-+]?\d{1,3}(?:,\d{3})+(?:\.\d+)?$/;

  if (value === null || value === undefined) {
    return 0;
  }

  if (typeof value === "number") {
    return isFinite(value) ? value : 0;
  }

  text = normalizeText(value);
  if (text === "") {
    return 0;
  }

  if (!plainNumericPattern.test(text) && !commaNumericPattern.test(text)) {
    throw new Error("数值格式不正确：" + value);
  }

  numberValue = Number(text.replace(/,/g, ""));
  if (!isFinite(numberValue)) {
    throw new Error("数值格式不正确：" + value);
  }
  return numberValue;
}

function pad2(value) {
  return value < 10 ? "0" + value : String(value);
}

function formatDateKey(year, month, day) {
  return String(year) + "-" + pad2(month) + "-" + pad2(day);
}

function buildValidatedDateKey(year, month, day, rawValue) {
  var date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error("日期格式不正确：" + rawValue);
  }
  return formatDateKey(year, month, day);
}

function normalizeDateKey(value) {
  var text;
  var match;
  var date;
  var excelDate;

  if (value === null || value === undefined) {
    return "";
  }

  if (Object.prototype.toString.call(value) === "[object Date]") {
    if (isNaN(value.getTime())) {
      throw new Error("日期格式不正确：" + value);
    }
    return formatDateKey(
      value.getFullYear(),
      value.getMonth() + 1,
      value.getDate()
    );
  }

  if (typeof value === "number") {
    if (!isFinite(value)) {
      throw new Error("日期格式不正确：" + value);
    }
    excelDate = new Date((value - 25569) * 86400 * 1000);
    if (isNaN(excelDate.getTime())) {
      throw new Error("日期格式不正确：" + value);
    }
    return formatDateKey(
      excelDate.getUTCFullYear(),
      excelDate.getUTCMonth() + 1,
      excelDate.getUTCDate()
    );
  }

  text = normalizeText(value);
  if (text === "") {
    return "";
  }

  match = text.match(
    /^(\d{4})([\/.-])(\d{1,2})\2(\d{1,2})(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?$/
  );
  if (!match) {
    throw new Error("日期格式不正确：" + value);
  }

  date = {
    year: Number(match[1]),
    month: Number(match[3]),
    day: Number(match[4])
  };
  return buildValidatedDateKey(date.year, date.month, date.day, value);
}

function rowsFromValues(values, headerRowIndex) {
  var matrix = normalizeMatrix(values);
  var rawHeaders = matrix[headerRowIndex - 1] || [];
  var headers = [];
  var rows = [];
  var headerIndex;
  var rowIndex;
  var colIndex;
  var dataRow;
  var outputRow;
  var header;
  var hasValue;

  for (headerIndex = 0; headerIndex < rawHeaders.length; headerIndex += 1) {
    headers.push(normalizeText(rawHeaders[headerIndex]));
  }

  for (rowIndex = headerRowIndex; rowIndex < matrix.length; rowIndex += 1) {
    dataRow = matrix[rowIndex] || [];
    outputRow = {
      _rowNumber: rowIndex + 1
    };
    hasValue = false;

    for (colIndex = 0; colIndex < headers.length; colIndex += 1) {
      header = headers[colIndex];
      if (!header) {
        continue;
      }

      outputRow[header] = dataRow[colIndex];
      if (!isBlankValue(dataRow[colIndex])) {
        hasValue = true;
      }
    }

    if (hasValue) {
      rows.push(outputRow);
    }
  }

  return {
    headers: headers,
    rows: rows
  };
}

function buildIssue(
  level,
  source,
  rowNumber,
  fieldName,
  rawValue,
  issueType,
  reason,
  suggestion
) {
  return {
    level: level,
    source: source,
    rowNumber: rowNumber,
    fieldName: fieldName,
    rawValue: rawValue,
    issueType: issueType,
    reason: reason,
    suggestion: suggestion
  };
}

function validateRequiredHeaders(source, headers, requiredHeaders) {
  var headerSet = {};
  var issues = [];
  var index;
  var header;
  var required;

  for (index = 0; index < headers.length; index += 1) {
    header = normalizeText(headers[index]);
    if (header) {
      headerSet[header] = true;
    }
  }

  for (index = 0; index < requiredHeaders.length; index += 1) {
    required = requiredHeaders[index];
    if (!headerSet[required]) {
      issues.push(
        buildIssue(
          "错误",
          source,
          "",
          required,
          "",
          "缺少关键列",
          source + " 表缺少关键列：" + required,
          "检查表头文字是否和模板一致，不要删除或重命名该列。"
        )
      );
    }
  }

  return issues;
}

function validateDateColumn(source, rows, fieldName) {
  var issues = [];
  var index;
  var row;
  var rawValue;

  for (index = 0; index < rows.length; index += 1) {
    row = rows[index];
    rawValue = row[fieldName];
    try {
      if (isBlankValue(rawValue)) {
        throw new Error("日期不能为空");
      }
      normalizeDateKey(rawValue);
    } catch (error) {
      issues.push(
        buildIssue(
          "错误",
          source,
          row._rowNumber,
          fieldName,
          normalizeText(rawValue),
          "日期格式不正确",
          error && error.message ? error.message : String(error),
          "改为 2026-05-01 或 2026/5/1 这类可识别日期。"
        )
      );
    }
  }

  return issues;
}

function validateNumberColumn(source, rows, fieldName) {
  var issues = [];
  var index;
  var row;
  var rawValue;

  for (index = 0; index < rows.length; index += 1) {
    row = rows[index];
    rawValue = row[fieldName];
    if (isBlankValue(rawValue)) {
      continue;
    }
    try {
      normalizeNumber(rawValue);
    } catch (error) {
      issues.push(
        buildIssue(
          "错误",
          source,
          row._rowNumber,
          fieldName,
          normalizeText(rawValue),
          "数值格式不正确",
          error && error.message ? error.message : String(error),
          "改为普通数字或千分位数字，避免混入文本单位、空格或非法逗号。"
        )
      );
    }
  }

  return issues;
}

function validateRequiredCell(source, rows, fieldName) {
  var issues = [];
  var index;
  var row;

  for (index = 0; index < rows.length; index += 1) {
    row = rows[index];
    if (isBlankValue(row[fieldName])) {
      issues.push(
        buildIssue(
          "错误",
          source,
          row._rowNumber,
          fieldName,
          "",
          "关键字段为空",
          source + " 第 " + row._rowNumber + " 行 " + fieldName + " 为空，查询时无法稳定关联或汇总。",
          "补齐该字段，或确认该行是否应从原始数据中删除。"
        )
      );
    }
  }

  return issues;
}

function buildCompositeKey(row, fieldNames) {
  var parts = [];
  var index;
  var value;

  for (index = 0; index < fieldNames.length; index += 1) {
    value = normalizeText(row[fieldNames[index]]);
    if (!value) {
      return "";
    }
    parts.push(value);
  }

  return parts.join("||");
}

function validateDuplicateKeys(source, rows, fieldNames) {
  var grouped = {};
  var order = [];
  var issues = [];
  var index;
  var row;
  var key;
  var rowNumbers;

  for (index = 0; index < rows.length; index += 1) {
    row = rows[index];
    key = buildCompositeKey(row, fieldNames);
    if (!key) {
      continue;
    }
    if (!grouped[key]) {
      grouped[key] = [];
      order.push(key);
    }
    grouped[key].push(row._rowNumber);
  }

  for (index = 0; index < order.length; index += 1) {
    key = order[index];
    rowNumbers = grouped[key];
    if (rowNumbers.length > 1) {
      issues.push(
        buildIssue(
          "提醒",
          source,
          rowNumbers.join(","),
          fieldNames.join("+"),
          key.split("||").join(" + "),
          "业务键重复",
          source + " 存在相同业务键的多行记录，查询宏会先合并后比较。",
          "如果这些行确实是拆分明细，可以保留；否则检查是否重复导出。"
        )
      );
    }
  }

  return issues;
}

function collectOaFormNumbers(rows) {
  var result = {};
  var index;
  var formNumber;

  for (index = 0; index < rows.length; index += 1) {
    formNumber = normalizeText(rows[index]["表单编号"]);
    if (formNumber) {
      result[formNumber] = true;
    }
  }

  return result;
}

function validateErpSourceFormExists(erpRows, oaFormNumbers) {
  var formSet = oaFormNumbers || {};
  var seenMissing = {};
  var issues = [];
  var index;
  var row;
  var sourceFormNumber;

  for (index = 0; index < erpRows.length; index += 1) {
    row = erpRows[index];
    sourceFormNumber = normalizeText(row["源单单号"]);
    if (!sourceFormNumber || formSet[sourceFormNumber] || seenMissing[sourceFormNumber]) {
      continue;
    }
    seenMissing[sourceFormNumber] = true;
    issues.push(
      buildIssue(
        "提醒",
        "ERP",
        row._rowNumber,
        "源单单号",
        sourceFormNumber,
        "ERP源单未在OA中找到",
        "ERP 源单单号在 OA 全量表单编号中找不到。",
        "作为提醒输出，请用 ERP 源单单号回 OA 系统补查。"
      )
    );
  }

  return issues;
}

function hasBlockingHeaderErrors(issues) {
  var index;
  var issue;

  for (index = 0; index < issues.length; index += 1) {
    issue = issues[index] || {};
    if (issue.level === "错误" && issue.issueType === "缺少关键列") {
      return true;
    }
  }

  return false;
}

function buildPrecheckIssues(oaTable, erpTable) {
  var config = getPrecheckConfig();
  var issues = [];
  var oaRows = (oaTable && oaTable.rows) || [];
  var erpRows = (erpTable && erpTable.rows) || [];
  var oaFormNumbers;

  issues = issues.concat(
    validateRequiredHeaders(
      "OA",
      (oaTable && oaTable.headers) || [],
      config.oaHeaders
    )
  );
  issues = issues.concat(
    validateRequiredHeaders(
      "ERP",
      (erpTable && erpTable.headers) || [],
      config.erpHeaders
    )
  );

  if (hasBlockingHeaderErrors(issues)) {
    return issues;
  }

  issues = issues.concat(validateDateColumn("OA", oaRows, "申请日期"));
  issues = issues.concat(validateDateColumn("ERP", erpRows, "日期"));
  issues = issues.concat(validateNumberColumn("OA", oaRows, "数量"));
  issues = issues.concat(validateNumberColumn("OA", oaRows, "实际预算金额mx"));
  issues = issues.concat(validateNumberColumn("ERP", erpRows, "实发数量"));
  issues = issues.concat(validateNumberColumn("ERP", erpRows, "总成本"));
  issues = issues.concat(validateRequiredCell("OA", oaRows, "表单编号"));
  issues = issues.concat(validateRequiredCell("OA", oaRows, "物料代码"));
  issues = issues.concat(validateRequiredCell("ERP", erpRows, "源单单号"));
  issues = issues.concat(validateRequiredCell("ERP", erpRows, "物料编码"));
  issues = issues.concat(
    validateDuplicateKeys(
      "OA",
      oaRows,
      [
        "表单编号",
        "物料代码"
      ]
    )
  );
  issues = issues.concat(
    validateDuplicateKeys(
      "ERP",
      erpRows,
      [
        "源单单号",
        "物料编码"
      ]
    )
  );

  oaFormNumbers = collectOaFormNumbers(oaRows);
  issues = issues.concat(validateErpSourceFormExists(erpRows, oaFormNumbers));

  return issues;
}

function issueRowsToValues(issues) {
  var values = [getPrecheckResultHeaders()];
  var rows = issues || [];
  var index;
  var issue;

  if (rows.length === 0) {
    values.push([
      "提醒",
      "系统",
      "",
      "",
      "",
      "未发现预验证问题",
      "未发现会阻断查询的预验证问题。",
      "可以继续运行查询。"
    ]);
    return values;
  }

  for (index = 0; index < rows.length; index += 1) {
    issue = rows[index] || {};
    values.push([
      issue.level,
      issue.source,
      issue.rowNumber,
      issue.fieldName,
      issue.rawValue,
      issue.issueType,
      issue.reason,
      issue.suggestion
    ]);
  }

  return values;
}

function getApplication() {
  if (typeof Application === "undefined" || !Application) {
    throw new Error("当前环境没有 WPS Application 对象，请在 WPS JS 宏环境中运行。");
  }
  return Application;
}

function getSheets(app) {
  var activeWorkbook = app.ActiveWorkbook || {};

  return (
    activeWorkbook.Worksheets ||
    activeWorkbook.Sheets ||
    app.Worksheets ||
    app.Sheets
  );
}

function findSheetByName(sheetName) {
  var app = getApplication();
  var sheets = getSheets(app);
  var index;
  var sheet;

  for (index = 1; index <= sheets.Count; index += 1) {
    sheet = sheets.Item(index);
    if (sheet.Name === sheetName) {
      return sheet;
    }
  }

  return null;
}

function getSheetByName(sheetName) {
  var sheet = findSheetByName(sheetName);

  if (!sheet) {
    throw new Error("找不到工作表：" + sheetName);
  }

  return sheet;
}

function ensureSheet(sheetName) {
  var app;
  var sheets;
  var sheet = findSheetByName(sheetName);

  if (sheet) {
    return sheet;
  }

  app = getApplication();
  sheets = getSheets(app);
  sheet = sheets.Add();
  sheet.Name = sheetName;
  return sheet;
}

function readUsedRangeValues(sheet) {
  var usedRange = sheet.UsedRange;
  var values;

  if (!usedRange) {
    return [];
  }

  values = usedRange.Value2;
  if (values === undefined) {
    values = usedRange.Value;
  }
  if (values === undefined || values === null) {
    return [];
  }
  return normalizeMatrix(values);
}

function readSheetTable(sheetName, headerRowIndex) {
  return rowsFromValues(readUsedRangeValues(getSheetByName(sheetName)), headerRowIndex);
}

function writeObjectValue(target, value) {
  var value2Error;

  try {
    target.Value2 = value;
    return;
  } catch (error) {
    value2Error = error;
  }

  try {
    target.Value = value;
  } catch (valueError) {
    throw new Error(
      "写入单元格失败，Value2: " +
        (value2Error && value2Error.message ? value2Error.message : String(value2Error)) +
        "; Value: " +
        (valueError && valueError.message ? valueError.message : String(valueError))
    );
  }
}

function setCell(sheet, address, value) {
  writeObjectValue(sheet.Range(address), value);
}

function writeMatrix(sheet, startRow, startCol, values) {
  var rowIndex;
  var colIndex;
  var row;

  for (rowIndex = 0; rowIndex < values.length; rowIndex += 1) {
    row = values[rowIndex] || [];
    for (colIndex = 0; colIndex < row.length; colIndex += 1) {
      writeObjectValue(
        sheet.Cells.Item(startRow + rowIndex, startCol + colIndex),
        row[colIndex]
      );
    }
  }
}

function clearResultSheet(sheet) {
  var range = sheet.Range("A1:H20000");

  if (range.ClearContents) {
    range.ClearContents();
    return;
  }
  writeObjectValue(range, "");
}

function writePrecheckResults(issues) {
  var sheet = ensureSheet(getPrecheckConfig().sheets.result);
  var rows = issues || [];
  var status = rows.length === 0 ? "未发现预验证问题" : "发现 " + rows.length + " 条预验证问题";

  clearResultSheet(sheet);
  setCell(sheet, "A1", "报废差异预验证");
  setCell(sheet, "A2", "状态");
  setCell(sheet, "B2", status);
  writeMatrix(sheet, 4, 1, issueRowsToValues(rows));
}

function buildSystemErrorIssue(error) {
  return buildIssue(
    "错误",
    "系统",
    "",
    "",
    "",
    "预验证执行失败",
    error && error.message ? error.message : String(error),
    "检查工作簿、工作表名称或宏运行环境。"
  );
}

function runScrapVariancePrecheck() {
  var config = getPrecheckConfig();
  var issues;
  var oaTable;
  var erpTable;

  try {
    oaTable = readSheetTable(config.sheets.oa, config.oaHeaderRow);
    erpTable = readSheetTable(config.sheets.erp, config.erpHeaderRow);
    issues = buildPrecheckIssues(oaTable, erpTable);
    writePrecheckResults(issues);
  } catch (error) {
    writePrecheckResults([buildSystemErrorIssue(error)]);
  }
}

/**
 * 预验证_Click Macro
 */
function 预验证_Click() {
  runScrapVariancePrecheck();
}
