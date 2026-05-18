import { ERP_REQUIRED_HEADERS, OA_REQUIRED_HEADERS } from "../constants";
import type { IssueLevel, OutputMatrix, ParsedTable, PrecheckIssue, RawRow, SheetSource } from "../types/scrap";
import { normalizeDateKey } from "../utils/date";
import { parseDecimal } from "../utils/decimal";
import { isBlankValue, normalizeText } from "../utils/text";

const PRECHECK_RESULT_HEADERS = ["级别", "数据源", "行号", "字段名", "原值", "问题类型", "原因", "处理建议"];

function getRows(table: ParsedTable | null | undefined): RawRow[] {
  return table?.rows ?? [];
}

function hasHeader(table: ParsedTable | null | undefined, fieldName: string): boolean {
  return (table?.headers ?? []).some((header) => normalizeText(header) === fieldName);
}

function findMissingHeaders(table: ParsedTable | null | undefined, requiredHeaders: readonly string[]): string[] {
  const headerSet = new Set((table?.headers ?? []).map((header) => normalizeText(header)).filter(Boolean));
  return requiredHeaders.filter((header) => !headerSet.has(header));
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export function buildIssue(
  level: IssueLevel,
  source: SheetSource,
  rowNumber: number | string,
  fieldName: string,
  rawValue: unknown,
  issueType: string,
  reason: string,
  suggestion: string
): PrecheckIssue {
  return {
    level,
    source,
    rowNumber,
    fieldName,
    rawValue: normalizeText(rawValue),
    issueType,
    reason,
    suggestion
  };
}

export function buildHeaderDetectionIssue(
  source: "OA" | "ERP",
  error: { issueType: string; message: string; missingHeaders: string[]; headerRowNumber: number | string }
): PrecheckIssue {
  const missingHeaders = error.missingHeaders.map((header) => normalizeText(header)).filter(Boolean);
  const missingText = missingHeaders.length > 0 ? `缺失字段：${missingHeaders.join("、")}。` : "";

  return buildIssue(
    "错误",
    source,
    error.headerRowNumber,
    "表头",
    missingHeaders.join("、"),
    error.issueType,
    missingText ? `${error.message} ${missingText}` : error.message,
    `${missingText}检查表头文字是否与模板完全一致，不要删除、重命名关键列，确认表头行没有被合并单元格或空行错位影响。`
  );
}

export function buildSystemErrorIssue(error: unknown): PrecheckIssue {
  return buildIssue(
    "错误",
    "系统",
    "",
    "",
    "",
    "预验证执行失败",
    errorMessage(error),
    "检查工作簿、工作表名称或宏运行环境。"
  );
}

function buildMissingRequiredHeaderIssue(
  source: "OA" | "ERP",
  table: ParsedTable | null | undefined,
  missingHeaders: string[],
  requiredCount: number
): PrecheckIssue {
  return buildHeaderDetectionIssue(source, {
    issueType: "缺少关键列",
    message: `${source} 表缺少关键列：缺失 ${missingHeaders.length}/${requiredCount} 个必需字段，无法继续预验证行级数据。`,
    missingHeaders,
    headerRowNumber: table?.headerRowNumber ?? ""
  });
}

function validateDateColumn(source: "OA" | "ERP", rows: RawRow[], fieldName: string): PrecheckIssue[] {
  const issues: PrecheckIssue[] = [];

  for (const row of rows) {
    const rawValue = row[fieldName];

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
          row._rowNumber ?? "",
          fieldName,
          rawValue,
          "日期格式不正确",
          errorMessage(error),
          "改为 2026-05-01 或 2026/5/1 这类可识别日期。"
        )
      );
    }
  }

  return issues;
}

function validateNumberColumn(source: "OA" | "ERP", rows: RawRow[], fieldName: string): PrecheckIssue[] {
  const issues: PrecheckIssue[] = [];

  for (const row of rows) {
    const rawValue = row[fieldName];
    if (isBlankValue(rawValue)) {
      continue;
    }

    try {
      parseDecimal(rawValue, fieldName);
    } catch (error) {
      issues.push(
        buildIssue(
          "错误",
          source,
          row._rowNumber ?? "",
          fieldName,
          rawValue,
          "数值格式不正确",
          errorMessage(error),
          "改为普通数字或千分位数字，避免混入文本单位、空格或非法逗号。"
        )
      );
    }
  }

  return issues;
}

function validateRequiredCell(source: "OA" | "ERP", rows: RawRow[], fieldName: string): PrecheckIssue[] {
  const issues: PrecheckIssue[] = [];

  for (const row of rows) {
    if (!isBlankValue(row[fieldName])) {
      continue;
    }

    issues.push(
      buildIssue(
        "错误",
        source,
        row._rowNumber ?? "",
        fieldName,
        "",
        "关键字段为空",
        `${source} 第 ${String(row._rowNumber ?? "")} 行 ${fieldName} 为空，查询时无法稳定关联或汇总。`,
        "补齐该字段，或确认该行是否应从原始数据中删除。"
      )
    );
  }

  return issues;
}

function buildCompositeKey(row: RawRow, fieldNames: string[]): string {
  const parts: string[] = [];

  for (const fieldName of fieldNames) {
    const value = normalizeText(row[fieldName]);
    if (!value) {
      return "";
    }
    parts.push(value);
  }

  return parts.join("||");
}

function validateDuplicateKeys(source: "OA" | "ERP", rows: RawRow[], fieldNames: string[]): PrecheckIssue[] {
  const grouped = new Map<string, Array<number | string>>();
  const issues: PrecheckIssue[] = [];

  for (const row of rows) {
    const key = buildCompositeKey(row, fieldNames);
    if (!key) {
      continue;
    }

    const rowNumbers = grouped.get(key) ?? [];
    rowNumbers.push(row._rowNumber ?? "");
    grouped.set(key, rowNumbers);
  }

  for (const [key, rowNumbers] of grouped) {
    if (rowNumbers.length <= 1) {
      continue;
    }

    issues.push(
      buildIssue(
        "提醒",
        source,
        rowNumbers.join(","),
        fieldNames.join("+"),
        key.split("||").join(" + "),
        "业务键重复",
        `${source} 存在相同业务键的多行记录，查询宏会先合并后比较。`,
        "如果这些行确实是拆分明细，可以保留；否则检查是否重复导出。"
      )
    );
  }

  return issues;
}

function collectOaFormNumbers(rows: RawRow[]): Set<string> {
  const formNumbers = new Set<string>();

  for (const row of rows) {
    const formNumber = normalizeText(row["表单编号"]);
    if (formNumber) {
      formNumbers.add(formNumber);
    }
  }

  return formNumbers;
}

function validateErpSourceFormExists(erpRows: RawRow[], oaFormNumbers: Set<string>): PrecheckIssue[] {
  const seenMissing = new Set<string>();
  const issues: PrecheckIssue[] = [];

  for (const row of erpRows) {
    const sourceFormNumber = normalizeText(row["源单单号"]);
    if (!sourceFormNumber || oaFormNumbers.has(sourceFormNumber) || seenMissing.has(sourceFormNumber)) {
      continue;
    }

    seenMissing.add(sourceFormNumber);
    issues.push(
      buildIssue(
        "提醒",
        "ERP",
        row._rowNumber ?? "",
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

function appendValidationIfHeaderExists(
  issues: PrecheckIssue[],
  table: ParsedTable | null | undefined,
  fieldName: string,
  validate: (rows: RawRow[], fieldName: string) => PrecheckIssue[]
): void {
  if (!hasHeader(table, fieldName)) {
    return;
  }
  issues.push(...validate(getRows(table), fieldName));
}

export function buildPrecheckIssues(
  oaTable: ParsedTable | null | undefined,
  erpTable: ParsedTable | null | undefined
): PrecheckIssue[] {
  const issues: PrecheckIssue[] = [];
  const oaRows = getRows(oaTable);
  const erpRows = getRows(erpTable);
  const missingHeaderIssues: PrecheckIssue[] = [];
  const missingOaHeaders = findMissingHeaders(oaTable, OA_REQUIRED_HEADERS);
  const missingErpHeaders = findMissingHeaders(erpTable, ERP_REQUIRED_HEADERS);

  if (missingOaHeaders.length > 0) {
    missingHeaderIssues.push(
      buildMissingRequiredHeaderIssue("OA", oaTable, missingOaHeaders, OA_REQUIRED_HEADERS.length)
    );
  }
  if (missingErpHeaders.length > 0) {
    missingHeaderIssues.push(
      buildMissingRequiredHeaderIssue("ERP", erpTable, missingErpHeaders, ERP_REQUIRED_HEADERS.length)
    );
  }
  if (missingHeaderIssues.length > 0) {
    return missingHeaderIssues;
  }

  appendValidationIfHeaderExists(issues, oaTable, "申请日期", (rows, fieldName) =>
    validateDateColumn("OA", rows, fieldName)
  );
  appendValidationIfHeaderExists(issues, erpTable, "日期", (rows, fieldName) =>
    validateDateColumn("ERP", rows, fieldName)
  );
  appendValidationIfHeaderExists(issues, oaTable, "数量", (rows, fieldName) =>
    validateNumberColumn("OA", rows, fieldName)
  );
  appendValidationIfHeaderExists(issues, oaTable, "实际预算金额mx", (rows, fieldName) =>
    validateNumberColumn("OA", rows, fieldName)
  );
  appendValidationIfHeaderExists(issues, erpTable, "实发数量", (rows, fieldName) =>
    validateNumberColumn("ERP", rows, fieldName)
  );
  appendValidationIfHeaderExists(issues, erpTable, "总成本", (rows, fieldName) =>
    validateNumberColumn("ERP", rows, fieldName)
  );
  appendValidationIfHeaderExists(issues, oaTable, "表单编号", (rows, fieldName) =>
    validateRequiredCell("OA", rows, fieldName)
  );
  appendValidationIfHeaderExists(issues, oaTable, "物料代码", (rows, fieldName) =>
    validateRequiredCell("OA", rows, fieldName)
  );
  appendValidationIfHeaderExists(issues, erpTable, "源单单号", (rows, fieldName) =>
    validateRequiredCell("ERP", rows, fieldName)
  );
  appendValidationIfHeaderExists(issues, erpTable, "物料编码", (rows, fieldName) =>
    validateRequiredCell("ERP", rows, fieldName)
  );

  if (hasHeader(oaTable, "表单编号") && hasHeader(oaTable, "物料代码")) {
    issues.push(...validateDuplicateKeys("OA", oaRows, ["表单编号", "物料代码"]));
  }
  if (hasHeader(erpTable, "源单单号") && hasHeader(erpTable, "物料编码")) {
    issues.push(...validateDuplicateKeys("ERP", erpRows, ["源单单号", "物料编码"]));
  }
  if (hasHeader(oaTable, "表单编号") && hasHeader(erpTable, "源单单号")) {
    issues.push(...validateErpSourceFormExists(erpRows, collectOaFormNumbers(oaRows)));
  }

  return issues;
}

export function issueRowsToValues(issues: PrecheckIssue[] | null | undefined): OutputMatrix {
  const values: OutputMatrix = [PRECHECK_RESULT_HEADERS];
  const rows = issues ?? [];

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

  for (const issue of rows) {
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
