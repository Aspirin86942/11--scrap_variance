import type { WpsMatrix } from "../types/wps";
import { normalizeText } from "../utils/text";

export interface HeaderDetectionOptions {
  minMatchCount: number;
  maxScanRows: number;
  usedRangeStartRow: number | undefined;
}

export interface HeaderDetectionSuccess {
  ok: true;
  headerRowIndex: number;
  headerRowNumber: number | string;
  headers: string[];
  columnIndex: Record<string, number>;
  matchedCount: number;
}

export interface HeaderDetectionFailure {
  ok: false;
  issueType: "无法识别表头" | "表头识别不唯一" | "关键列重复";
  message: string;
  headerRowIndex: number;
  headerRowNumber: number | string;
  matchedCount: number;
  requiredCount: number;
  missingHeaders: string[];
  duplicateHeaders: string[];
}

export type HeaderDetectionResult = HeaderDetectionSuccess | HeaderDetectionFailure;

export class HeaderDetectionError extends Error {
  readonly result: HeaderDetectionFailure;

  constructor(result: HeaderDetectionFailure) {
    super(result.message);
    this.name = "HeaderDetectionError";
    this.result = result;
    Object.setPrototypeOf(this, HeaderDetectionError.prototype);
  }
}

interface Candidate {
  rowIndex: number;
  rowNumber: number | string;
  headers: string[];
  columnIndex: Record<string, number>;
  matchedHeaders: Set<string>;
  duplicateRequiredCount: number;
  duplicateRequiredHeaders: string[];
  nonBlankCount: number;
}

function rowNumberFor(index: number, usedRangeStartRow: number | undefined): number | string {
  if (typeof usedRangeStartRow === "number" && Number.isFinite(usedRangeStartRow)) {
    return usedRangeStartRow + index;
  }
  return `相对 UsedRange 第 ${index + 1} 行`;
}

function buildCandidate(
  row: unknown[],
  rowIndex: number,
  requiredHeaders: string[],
  usedRangeStartRow: number | undefined
): Candidate {
  const requiredSet = new Set(requiredHeaders);
  const seenRequired = new Set<string>();
  const columnIndex: Record<string, number> = {};
  const duplicateRequiredHeaders: string[] = [];
  let duplicateRequiredCount = 0;
  let nonBlankCount = 0;

  const headers = row.map((cell, colIndex) => {
    const header = normalizeText(cell);
    if (header) {
      nonBlankCount += 1;
    }
    if (requiredSet.has(header)) {
      if (Object.prototype.hasOwnProperty.call(columnIndex, header)) {
        duplicateRequiredCount += 1;
        if (!duplicateRequiredHeaders.includes(header)) {
          duplicateRequiredHeaders.push(header);
        }
      } else {
        columnIndex[header] = colIndex;
      }
      seenRequired.add(header);
    }
    return header;
  });

  return {
    rowIndex,
    rowNumber: rowNumberFor(rowIndex, usedRangeStartRow),
    headers,
    columnIndex,
    matchedHeaders: seenRequired,
    duplicateRequiredCount,
    duplicateRequiredHeaders,
    nonBlankCount
  };
}

function compareCandidates(left: Candidate, right: Candidate): number {
  const matchDiff = right.matchedHeaders.size - left.matchedHeaders.size;
  if (matchDiff !== 0) {
    return matchDiff;
  }

  const duplicateDiff = left.duplicateRequiredCount - right.duplicateRequiredCount;
  if (duplicateDiff !== 0) {
    return duplicateDiff;
  }

  return right.nonBlankCount - left.nonBlankCount;
}

function missingHeaders(requiredHeaders: string[], candidate: Candidate | undefined): string[] {
  if (!candidate) {
    return requiredHeaders.slice();
  }
  return requiredHeaders.filter((header) => !candidate.matchedHeaders.has(header));
}

function rowNumberLabel(rowNumber: number | string): string {
  return typeof rowNumber === "number" ? `第 ${rowNumber} 行` : rowNumber;
}

function failure(
  issueType: "无法识别表头" | "表头识别不唯一" | "关键列重复",
  requiredHeaders: string[],
  candidate: Candidate | undefined,
  scannedRows: number
): HeaderDetectionFailure {
  const matchedCount = candidate?.matchedHeaders.size ?? 0;
  const rowNumber = candidate?.rowNumber ?? "相对 UsedRange 第 1 行";
  const missing = missingHeaders(requiredHeaders, candidate);
  const duplicateHeaders = candidate?.duplicateRequiredHeaders ?? [];
  const candidateContext = `候选行：${rowNumberLabel(rowNumber)}。`;
  const missingContext = missing.length > 0 ? `缺失字段：${missing.join("、")}。` : "";
  const duplicateContext =
    duplicateHeaders.length > 0 ? `重复必需字段：${duplicateHeaders.join("、")}。` : "";
  let message: string;

  if (issueType === "关键列重复") {
    message = `关键列重复：${candidateContext}${duplicateContext}请删除或重命名重复列后重试。`;
  } else if (issueType === "表头识别不唯一") {
    message = `表头识别不唯一：已扫描 UsedRange 前 ${scannedRows} 行，多个候选行最多命中 ${matchedCount}/${requiredHeaders.length} 个必需字段。${candidateContext}${missingContext}`;
  } else {
    message = `无法识别表头：已扫描 UsedRange 前 ${scannedRows} 行，最多命中 ${matchedCount}/${requiredHeaders.length} 个必需字段。${candidateContext}${missingContext}`;
  }

  return {
    ok: false,
    issueType,
    message,
    headerRowIndex: candidate?.rowIndex ?? 0,
    headerRowNumber: rowNumber,
    matchedCount,
    requiredCount: requiredHeaders.length,
    missingHeaders: missing,
    duplicateHeaders
  };
}

export function detectHeaderRow(
  matrix: WpsMatrix,
  requiredHeaders: string[],
  options: HeaderDetectionOptions
): HeaderDetectionResult {
  const scanRows = Math.min(options.maxScanRows, matrix.length);
  const candidates = matrix
    .slice(0, scanRows)
    .map((row, rowIndex) => buildCandidate(row, rowIndex, requiredHeaders, options.usedRangeStartRow));

  const sorted = candidates.slice().sort(compareCandidates);
  const best = sorted[0];
  if (!best || best.matchedHeaders.size < options.minMatchCount) {
    return failure("无法识别表头", requiredHeaders, best, scanRows);
  }

  const tied = sorted.filter((candidate) => compareCandidates(candidate, best) === 0);
  if (tied.length > 1 && best.matchedHeaders.size < requiredHeaders.length) {
    return failure("表头识别不唯一", requiredHeaders, best, scanRows);
  }

  const selected = tied.length > 1 ? tied.sort((left, right) => left.rowIndex - right.rowIndex)[0] : best;
  if (selected.duplicateRequiredCount > 0) {
    return failure("关键列重复", requiredHeaders, selected, scanRows);
  }

  return {
    ok: true,
    headerRowIndex: selected.rowIndex,
    headerRowNumber: selected.rowNumber,
    headers: selected.headers,
    columnIndex: selected.columnIndex,
    matchedCount: selected.matchedHeaders.size
  };
}
