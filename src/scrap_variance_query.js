(function (root) {
  "use strict";

  var oaHeaders = [
    "表单编号",
    "申请日期",
    "公司简称",
    "一级部门",
    "二级部门",
    "物料代码",
    "物料名称",
    "数量",
    "实际预算金额mx",
  ];

  var erpHeaders = [
    "单据编号",
    "日期",
    "源单单号",
    "区分公司简称",
    "一级部门",
    "二级部门",
    "物料编码",
    "物料名称",
    "实发数量",
    "总成本",
  ];

  var CONFIG = {
    sheets: {
      oa: "查询OA-存货报废申请单",
      erp: "查询ERP-报废明细表",
      panel: "查询面板",
    },
    oaHeaders: oaHeaders,
    erpHeaders: erpHeaders,
  };

  var DIFFERENCE_TYPE_PRIORITY = [
    "OA有申请，ERP无出库",
    "ERP出库对应OA未在当前OA数据中找到",
    "OA和ERP都有，但物料明细不一致",
    "OA和ERP都有，但数量不同",
    "OA和ERP都有，数量一致",
  ];

  var SUMMARY_HEADERS = [
    "公司简称",
    "一级部门",
    "二级部门",
    "OA数量合计",
    "ERP实发数量合计",
    "数量差额",
    "OA实际预算金额mx合计",
    "ERP总成本合计",
    "金额差额",
    "差异类型摘要",
  ];

  var DETAIL_HEADERS = [
    "差异类型",
    "OA表单编号",
    "ERP出库单号",
    "物料编码",
    "物料名称",
    "公司简称",
    "一级部门",
    "二级部门",
    "OA数量合计",
    "ERP实发数量合计",
    "数量差额",
    "OA实际预算金额mx合计",
    "ERP总成本合计",
    "金额差额",
    "备注",
  ];

  function normalizeText(value) {
    if (value === null || value === undefined) {
      return "";
    }
    return String(value).trim();
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
      day: Number(match[4]),
    };
    return buildValidatedDateKey(date.year, date.month, date.day, value);
  }

  function parseFilters(input) {
    var source = input || {};
    var filters = {
      company: normalizeText(source.company),
      dept1: normalizeText(source.dept1),
      dept2: normalizeText(source.dept2),
      startDate: normalizeDateKey(source.startDate),
      endDate: normalizeDateKey(source.endDate),
    };

    if (filters.startDate && filters.endDate && filters.startDate > filters.endDate) {
      throw new Error(
        "开始日期不能晚于结束日期：" + filters.startDate + " > " + filters.endDate
      );
    }

    return filters;
  }

  function isDateInRange(dateKey, filters) {
    var activeFilters = filters || {};

    if (!dateKey) {
      return false;
    }
    if (activeFilters.startDate && dateKey < activeFilters.startDate) {
      return false;
    }
    if (activeFilters.endDate && dateKey > activeFilters.endDate) {
      return false;
    }
    return true;
  }

  function matchesOrgFilters(rowCompany, rowDept1, rowDept2, filters) {
    var activeFilters = filters || {};

    if (activeFilters.company && normalizeText(rowCompany) !== activeFilters.company) {
      return false;
    }
    if (activeFilters.dept1 && normalizeText(rowDept1) !== activeFilters.dept1) {
      return false;
    }
    if (activeFilters.dept2 && normalizeText(rowDept2) !== activeFilters.dept2) {
      return false;
    }
    return true;
  }

  function makeDetailKey(formNumber, itemCode) {
    return normalizeText(formNumber) + "||" + normalizeText(itemCode);
  }

  function buildAllOaFormNumberSet(oaRows) {
    var result = {};
    var rows = oaRows || [];
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

  function buildOaRows(oaRows, filters) {
    var result = {};
    var rows = oaRows || [];
    var index;
    var row;
    var dateKey;
    var formNumber;
    var itemCode;
    var key;

    for (index = 0; index < rows.length; index += 1) {
      row = rows[index];
      dateKey = normalizeDateKey(row["申请日期"]);
      if (!isDateInRange(dateKey, filters)) {
        continue;
      }
      if (
        !matchesOrgFilters(
          row["公司简称"],
          row["一级部门"],
          row["二级部门"],
          filters
        )
      ) {
        continue;
      }

      formNumber = normalizeText(row["表单编号"]);
      itemCode = normalizeText(row["物料代码"]);
      if (!formNumber || !itemCode) {
        continue;
      }

      key = makeDetailKey(formNumber, itemCode);
      if (!result[key]) {
        // 同一个 OA 表单和物料只保留一条汇总记录，后续比较逻辑依赖这个稳定粒度。
        result[key] = {
          formNumber: formNumber,
          itemCode: itemCode,
          itemName: normalizeText(row["物料名称"]),
          company: normalizeText(row["公司简称"]),
          dept1: normalizeText(row["一级部门"]),
          dept2: normalizeText(row["二级部门"]),
          quantity: 0,
          amount: 0,
        };
      }

      result[key].quantity += normalizeNumber(row["数量"]);
      result[key].amount += normalizeNumber(row["实际预算金额mx"]);
    }

    return result;
  }

  function collectSelectedOaForms(oaGroupedRows) {
    var result = {};
    var rows = oaGroupedRows || {};
    var keys = Object.keys(rows);
    var index;
    var key;
    var row;
    var formNumber;

    for (index = 0; index < keys.length; index += 1) {
      key = keys[index];
      row = rows[key] || {};
      formNumber = normalizeText(row.formNumber || row.sourceFormNumber);
      if (!formNumber) {
        formNumber = normalizeText(key.split("||")[0]);
      }
      if (formNumber) {
        result[formNumber] = true;
      }
    }

    return result;
  }

  function addErpRowToGroup(result, row, sourceFormNumber, itemCode) {
    var key = makeDetailKey(sourceFormNumber, itemCode);
    var docNumber = normalizeText(row["单据编号"]);

    if (!result[key]) {
      result[key] = {
        sourceFormNumber: sourceFormNumber,
        formNumber: sourceFormNumber,
        itemCode: itemCode,
        itemName: normalizeText(row["物料名称"]),
        company: normalizeText(row["区分公司简称"]),
        dept1: normalizeText(row["一级部门"]),
        dept2: normalizeText(row["二级部门"]),
        quantity: 0,
        cost: 0,
        erpDocNumbers: [],
      };
    }

    result[key].quantity += normalizeNumber(row["实发数量"]);
    result[key].cost += normalizeNumber(row["总成本"]);
    if (docNumber && result[key].erpDocNumbers.indexOf(docNumber) === -1) {
      result[key].erpDocNumbers.push(docNumber);
    }
  }

  function buildErpRowsForOa(erpRows, oaGroupedRows) {
    var result = {};
    var selectedForms = collectSelectedOaForms(oaGroupedRows);
    var rows = erpRows || [];
    var index;
    var row;
    var sourceFormNumber;
    var itemCode;

    for (index = 0; index < rows.length; index += 1) {
      row = rows[index];
      sourceFormNumber = normalizeText(row["源单单号"]);
      itemCode = normalizeText(row["物料编码"]);

      if (!sourceFormNumber || !itemCode || !selectedForms[sourceFormNumber]) {
        continue;
      }

      addErpRowToGroup(result, row, sourceFormNumber, itemCode);
    }

    return result;
  }

  function buildErpOnlyRows(erpRows, allOaFormNumbers, filters) {
    var result = {};
    var rows = erpRows || [];
    var formNumberSet = allOaFormNumbers || {};
    var index;
    var row;
    var dateKey;
    var sourceFormNumber;
    var itemCode;

    for (index = 0; index < rows.length; index += 1) {
      row = rows[index];
      dateKey = normalizeDateKey(row["日期"]);
      if (!isDateInRange(dateKey, filters)) {
        continue;
      }
      if (
        !matchesOrgFilters(
          row["区分公司简称"],
          row["一级部门"],
          row["二级部门"],
          filters
        )
      ) {
        continue;
      }

      sourceFormNumber = normalizeText(row["源单单号"]);
      itemCode = normalizeText(row["物料编码"]);
      if (!sourceFormNumber || !itemCode || formNumberSet[sourceFormNumber]) {
        continue;
      }

      addErpRowToGroup(result, row, sourceFormNumber, itemCode);
    }

    return result;
  }

  function round2(value) {
    return Math.round(normalizeNumber(value) * 100) / 100;
  }

  function unionKeys(left, right) {
    var result = [];
    var seen = {};
    var leftKeys = Object.keys(left || {});
    var rightKeys = Object.keys(right || {});
    var index;
    var key;

    for (index = 0; index < leftKeys.length; index += 1) {
      key = leftKeys[index];
      if (!seen[key]) {
        seen[key] = true;
        result.push(key);
      }
    }

    for (index = 0; index < rightKeys.length; index += 1) {
      key = rightKeys[index];
      if (!seen[key]) {
        seen[key] = true;
        result.push(key);
      }
    }

    return result;
  }

  function buildFormNumberSet(groupedRows) {
    var result = {};
    var rows = groupedRows || {};
    var keys = Object.keys(rows);
    var index;
    var row;
    var formNumber;

    for (index = 0; index < keys.length; index += 1) {
      row = rows[keys[index]] || {};
      formNumber = normalizeText(row.formNumber || row.sourceFormNumber);
      if (!formNumber) {
        formNumber = normalizeText(keys[index].split("||")[0]);
      }
      if (formNumber) {
        result[formNumber] = true;
      }
    }

    return result;
  }

  function formatErpDocNumbers(erp) {
    var docNumbers = erp && erp.erpDocNumbers;

    if (!docNumbers) {
      return "";
    }
    if (Object.prototype.toString.call(docNumbers) === "[object Array]") {
      return docNumbers.join(",");
    }
    return normalizeText(docNumbers);
  }

  function buildDifference(differenceType, oa, erp) {
    var oaRow = oa || {};
    var erpRow = erp || {};
    var formNumber = normalizeText(
      oaRow.formNumber || erpRow.formNumber || erpRow.sourceFormNumber
    );
    var itemCode = normalizeText(oaRow.itemCode || erpRow.itemCode);
    var itemName = normalizeText(oaRow.itemName || erpRow.itemName);
    var company = normalizeText(oaRow.company || erpRow.company);
    var dept1 = normalizeText(oaRow.dept1 || erpRow.dept1);
    var dept2 = normalizeText(oaRow.dept2 || erpRow.dept2);
    var oaQuantity = oa ? round2(oaRow.quantity) : 0;
    var erpQuantity = erp ? round2(erpRow.quantity) : 0;
    var oaAmount = oa ? round2(oaRow.amount) : 0;
    var erpCost = erp ? round2(erpRow.cost) : 0;
    var remark =
      differenceType === "ERP出库对应OA未在当前OA数据中找到"
        ? "请用 ERP 源单单号回 OA 系统补查。"
        : "";

    return {
      differenceType: differenceType,
      formNumber: formNumber,
      erpDocNumbers: formatErpDocNumbers(erp),
      itemCode: itemCode,
      itemName: itemName,
      company: company,
      dept1: dept1,
      dept2: dept2,
      oaQuantity: oaQuantity,
      erpQuantity: erpQuantity,
      quantityDiff: round2(oaQuantity - erpQuantity),
      oaAmount: oaAmount,
      erpCost: erpCost,
      amountDiff: round2(oaAmount - erpCost),
      remark: remark,
    };
  }

  function compareRows(oaRows, erpRowsForOa, erpOnlyRows) {
    var details = [];
    var keys = unionKeys(oaRows, erpRowsForOa);
    var erpFormNumbers = buildFormNumberSet(erpRowsForOa);
    var erpOnlyKeys = Object.keys(erpOnlyRows || {});
    var index;
    var key;
    var oa;
    var erp;
    var formNumber;
    var differenceType;

    for (index = 0; index < keys.length; index += 1) {
      key = keys[index];
      oa = oaRows && oaRows[key];
      erp = erpRowsForOa && erpRowsForOa[key];
      formNumber = normalizeText((oa && oa.formNumber) || key.split("||")[0]);

      if (oa && !erp && !erpFormNumbers[formNumber]) {
        differenceType = "OA有申请，ERP无出库";
      } else if (!oa || !erp) {
        differenceType = "OA和ERP都有，但物料明细不一致";
      } else if (round2(oa.quantity) !== round2(erp.quantity)) {
        differenceType = "OA和ERP都有，但数量不同";
      } else {
        differenceType = "OA和ERP都有，数量一致";
      }

      details.push(buildDifference(differenceType, oa, erp));
    }

    for (index = 0; index < erpOnlyKeys.length; index += 1) {
      key = erpOnlyKeys[index];
      details.push(
        buildDifference(
          "ERP出库对应OA未在当前OA数据中找到",
          null,
          erpOnlyRows[key]
        )
      );
    }

    return details;
  }

  function addSummaryType(summary, differenceType) {
    var type = normalizeText(differenceType);

    if (type) {
      summary._differenceTypes[type] = true;
    }
  }

  function buildSummaryRows(detailRows) {
    var rows = detailRows || [];
    var grouped = {};
    var order = [];
    var index;
    var row;
    var key;
    var summary;
    var typeIndex;
    var summaryTypes;
    var result = [];

    for (index = 0; index < rows.length; index += 1) {
      row = rows[index] || {};
      key =
        normalizeText(row.company) +
        "||" +
        normalizeText(row.dept1) +
        "||" +
        normalizeText(row.dept2);

      if (!grouped[key]) {
        grouped[key] = {
          company: normalizeText(row.company),
          dept1: normalizeText(row.dept1),
          dept2: normalizeText(row.dept2),
          oaQuantity: 0,
          erpQuantity: 0,
          quantityDiff: 0,
          oaAmount: 0,
          erpCost: 0,
          amountDiff: 0,
          differenceSummary: "",
          _differenceTypes: {},
        };
        order.push(key);
      }

      summary = grouped[key];
      summary.oaQuantity = round2(summary.oaQuantity + normalizeNumber(row.oaQuantity));
      summary.erpQuantity = round2(
        summary.erpQuantity + normalizeNumber(row.erpQuantity)
      );
      summary.oaAmount = round2(summary.oaAmount + normalizeNumber(row.oaAmount));
      summary.erpCost = round2(summary.erpCost + normalizeNumber(row.erpCost));
      addSummaryType(summary, row.differenceType);
    }

    for (index = 0; index < order.length; index += 1) {
      summary = grouped[order[index]];
      summaryTypes = [];
      summary.quantityDiff = round2(summary.oaQuantity - summary.erpQuantity);
      summary.amountDiff = round2(summary.oaAmount - summary.erpCost);

      for (
        typeIndex = 0;
        typeIndex < DIFFERENCE_TYPE_PRIORITY.length;
        typeIndex += 1
      ) {
        if (summary._differenceTypes[DIFFERENCE_TYPE_PRIORITY[typeIndex]]) {
          summaryTypes.push(DIFFERENCE_TYPE_PRIORITY[typeIndex]);
        }
      }

      summary.differenceSummary = summaryTypes.join("、");
      delete summary._differenceTypes;
      result.push(summary);
    }

    return result;
  }

  function summaryRowsToValues(summaryRows) {
    var rows = summaryRows || [];
    var values = [SUMMARY_HEADERS];
    var index;
    var row;

    for (index = 0; index < rows.length; index += 1) {
      row = rows[index] || {};
      values.push([
        row.company,
        row.dept1,
        row.dept2,
        row.oaQuantity,
        row.erpQuantity,
        row.quantityDiff,
        row.oaAmount,
        row.erpCost,
        row.amountDiff,
        row.differenceSummary,
      ]);
    }

    return values;
  }

  function detailRowsToValues(detailRows) {
    var rows = detailRows || [];
    var values = [DETAIL_HEADERS];
    var index;
    var row;

    for (index = 0; index < rows.length; index += 1) {
      row = rows[index] || {};
      values.push([
        row.differenceType,
        row.formNumber,
        row.erpDocNumbers,
        row.itemCode,
        row.itemName,
        row.company,
        row.dept1,
        row.dept2,
        row.oaQuantity,
        row.erpQuantity,
        row.quantityDiff,
        row.oaAmount,
        row.erpCost,
        row.amountDiff,
        row.remark,
      ]);
    }

    return values;
  }

  function getApplication() {
    if (!root.Application) {
      throw new Error("当前环境没有 WPS Application 对象，请在 WPS JS 宏环境中运行。");
    }
    return root.Application;
  }

  function getSheets(app) {
    var activeWorkbook = app.ActiveWorkbook || {};

    // WPS 不同版本会暴露 Worksheets 或 Sheets，这里只收敛入口差异。
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

  function isBlankValue(value) {
    return value === null || value === undefined || normalizeText(value) === "";
  }

  function rowsFromValues(values, headerRowIndex) {
    var matrix = normalizeMatrix(values);
    var headers = matrix[headerRowIndex - 1] || [];
    var rows = [];
    var rowIndex;
    var colIndex;
    var dataRow;
    var outputRow;
    var header;
    var hasValue;

    for (rowIndex = headerRowIndex; rowIndex < matrix.length; rowIndex += 1) {
      dataRow = matrix[rowIndex] || [];
      outputRow = {};
      hasValue = false;

      for (colIndex = 0; colIndex < headers.length; colIndex += 1) {
        header = normalizeText(headers[colIndex]);
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

    return rows;
  }

  function readSheetData(sheetName, headerRowIndex) {
    var sheet = getSheetByName(sheetName);
    var values = readUsedRangeValues(sheet);

    return rowsFromValues(values, headerRowIndex);
  }

  function requireColumns(rows, requiredColumns, sheetName) {
    var columns = rows && rows[0] ? rows[0] : null;
    var missing = [];
    var index;
    var columnName;

    if (!rows || rows.length === 0) {
      throw new Error("工作表没有数据：" + sheetName);
    }

    for (index = 0; index < requiredColumns.length; index += 1) {
      columnName = requiredColumns[index];
      if (!Object.prototype.hasOwnProperty.call(columns, columnName)) {
        missing.push(columnName);
      }
    }

    if (missing.length > 0) {
      throw new Error(sheetName + " 缺少关键列：" + missing.join("、"));
    }
  }

  function validateRequiredColumns(oaRows, erpRows) {
    requireColumns(oaRows, CONFIG.oaHeaders, CONFIG.sheets.oa);
    requireColumns(erpRows, CONFIG.erpHeaders, CONFIG.sheets.erp);
  }

  function setCell(sheet, address, value) {
    sheet.Range(address).Value = value;
  }

  function writeMatrix(sheet, startRow, startCol, values) {
    var rowIndex;
    var colIndex;
    var row;

    for (rowIndex = 0; rowIndex < values.length; rowIndex += 1) {
      row = values[rowIndex] || [];
      for (colIndex = 0; colIndex < row.length; colIndex += 1) {
        sheet.Cells.Item(startRow + rowIndex, startCol + colIndex).Value =
          row[colIndex];
      }
    }
  }

  function clearPanelOutput(sheet) {
    var range = sheet.Range("A8:O20000");

    if (range.ClearContents) {
      range.ClearContents();
      return;
    }
    range.Value = "";
  }

  function setupQueryPanel() {
    var sheet = ensureSheet(CONFIG.sheets.panel);

    setCell(sheet, "A1", "报废差异查询");
    setCell(sheet, "A2", "公司简称");
    setCell(sheet, "A3", "一级部门");
    setCell(sheet, "A4", "二级部门");
    setCell(sheet, "A5", "开始日期");
    setCell(sheet, "A6", "结束日期");
    setCell(sheet, "A7", "运行函数");
    setCell(sheet, "B7", "runScrapVarianceQuery");

    return sheet;
  }

  function getRangeValue(sheet, address) {
    var range = sheet.Range(address);

    if (range.Value2 !== undefined) {
      return range.Value2;
    }
    return range.Value;
  }

  function getMatrixValue(matrix, rowIndex, colIndex) {
    if (matrix[rowIndex] && isArray(matrix[rowIndex])) {
      return matrix[rowIndex][colIndex];
    }
    if (matrix.length === 1 && isArray(matrix[0])) {
      return matrix[0][rowIndex];
    }
    return undefined;
  }

  function normalizePanelDateValue(value) {
    if (
      value === null ||
      value === undefined ||
      value === 0 ||
      normalizeText(value) === ""
    ) {
      return "";
    }
    return value;
  }

  function readFiltersFromPanel(sheet) {
    var values = normalizeMatrix(getRangeValue(sheet, "B2:B6"));

    return parseFilters({
      company: getMatrixValue(values, 0, 0),
      dept1: getMatrixValue(values, 1, 0),
      dept2: getMatrixValue(values, 2, 0),
      startDate: normalizePanelDateValue(getMatrixValue(values, 3, 0)),
      endDate: normalizePanelDateValue(getMatrixValue(values, 4, 0)),
    });
  }

  function writeErrorToPanel(message) {
    var sheet = ensureSheet(CONFIG.sheets.panel);

    clearPanelOutput(sheet);
    setCell(sheet, "A8", "错误");
    setCell(sheet, "B8", message);
  }

  function buildFallbackErrorMessage(originalMessage, panelError) {
    var writeErrorMessage =
      panelError && panelError.message ? panelError.message : String(panelError);

    return (
      originalMessage + "; 同时写入查询面板失败：" + writeErrorMessage
    );
  }

  function safeWriteErrorToPanel(message) {
    try {
      writeErrorToPanel(message);
    } catch (writeError) {
      throw new Error(buildFallbackErrorMessage(message, writeError));
    }
  }

  function writeResults(summaryRows, detailRows) {
    var sheet = ensureSheet(CONFIG.sheets.panel);
    var summaryValues = summaryRowsToValues(summaryRows);
    var detailValues = detailRowsToValues(detailRows);
    var detailStartRow = 11 + summaryValues.length;

    clearPanelOutput(sheet);
    setCell(sheet, "A8", "汇总差异");
    writeMatrix(sheet, 9, 1, summaryValues);
    setCell(sheet, "A" + detailStartRow, "明细差异");
    writeMatrix(sheet, detailStartRow + 1, 1, detailValues);
  }

  function runScrapVarianceQuery() {
    var panel;
    var filters;
    var oaRows;
    var erpRows;
    var allOaFormNumbers;
    var oaGroupedRows;
    var erpRowsForOa;
    var erpOnlyRows;
    var detailRows;
    var summaryRows;

    try {
      panel = setupQueryPanel();
      filters = readFiltersFromPanel(panel);
      oaRows = readSheetData(CONFIG.sheets.oa, 3);
      erpRows = readSheetData(CONFIG.sheets.erp, 1);
      validateRequiredColumns(oaRows, erpRows);

      allOaFormNumbers = buildAllOaFormNumberSet(oaRows);
      oaGroupedRows = buildOaRows(oaRows, filters);
      if (Object.keys(oaGroupedRows).length === 0) {
        clearPanelOutput(panel);
        setCell(panel, "A8", "查询条件没有匹配到 OA 数据。");
        return;
      }

      erpRowsForOa = buildErpRowsForOa(erpRows, oaGroupedRows);
      erpOnlyRows = buildErpOnlyRows(erpRows, allOaFormNumbers, filters);
      detailRows = compareRows(oaGroupedRows, erpRowsForOa, erpOnlyRows);
      summaryRows = buildSummaryRows(detailRows);
      writeResults(summaryRows, detailRows);
    } catch (error) {
      safeWriteErrorToPanel(
        error && error.message ? error.message : String(error)
      );
    }
  }

  var ScrapVarianceCore = {
    CONFIG: CONFIG,
    SUMMARY_HEADERS: SUMMARY_HEADERS,
    DETAIL_HEADERS: DETAIL_HEADERS,
    normalizeText: normalizeText,
    normalizeNumber: normalizeNumber,
    normalizeDateKey: normalizeDateKey,
    parseFilters: parseFilters,
    isDateInRange: isDateInRange,
    makeDetailKey: makeDetailKey,
    buildAllOaFormNumberSet: buildAllOaFormNumberSet,
    buildOaRows: buildOaRows,
    buildErpRowsForOa: buildErpRowsForOa,
    buildErpOnlyRows: buildErpOnlyRows,
    unionKeys: unionKeys,
    buildFormNumberSet: buildFormNumberSet,
    buildDifference: buildDifference,
    compareRows: compareRows,
    buildSummaryRows: buildSummaryRows,
    summaryRowsToValues: summaryRowsToValues,
    detailRowsToValues: detailRowsToValues,
    normalizeMatrix: normalizeMatrix,
    rowsFromValues: rowsFromValues,
    normalizePanelDateValue: normalizePanelDateValue,
    buildFallbackErrorMessage: buildFallbackErrorMessage,
    validateRequiredColumns: validateRequiredColumns,
  };

  root.ScrapVarianceCore = ScrapVarianceCore;
  root.setupQueryPanel = setupQueryPanel;
  root.runScrapVarianceQuery = runScrapVarianceQuery;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      ScrapVarianceCore: ScrapVarianceCore,
      setupQueryPanel: setupQueryPanel,
      runScrapVarianceQuery: runScrapVarianceQuery,
    };
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
