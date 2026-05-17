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
  issueType: "无法识别表头" | "表头识别不唯一";
  message: string;
  headerRowIndex: number;
  headerRowNumber: number | string;
  matchedCount: number;
  requiredCount: number;
  missingHeaders: string[];
}

export type HeaderDetectionResult = HeaderDetectionSuccess | HeaderDetectionFailure;

interface Candidate {
  rowIndex: number;
  rowNumber: number | string;
  headers: string[];
  columnIndex: Record<string, number>;
  matchedHeaders: Set<string>;
  duplicateRequiredCount: number;
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

function failure(
  issueType: "无法识别表头" | "表头识别不唯一",
  requiredHeaders: string[],
  candidate: Candidate | undefined,
  scannedRows: number
): HeaderDetectionFailure {
  const matchedCount = candidate?.matchedHeaders.size ?? 0;
  const rowNumber = candidate?.rowNumber ?? "相对 UsedRange 第 1 行";
  const message =
    issueType === "表头识别不唯一"
      ? `表头识别不唯一：已扫描 UsedRange 前 ${scannedRows} 行，多个候选行最多命中 ${matchedCount}/${requiredHeaders.length} 个必需字段。`
      : `无法识别表头：已扫描 UsedRange 前 ${scannedRows} 行，最多命中 ${matchedCount}/${requiredHeaders.length} 个必需字段。`;

  return {
    ok: false,
    issueType,
    message,
    headerRowIndex: candidate?.rowIndex ?? 0,
    headerRowNumber: rowNumber,
    matchedCount,
    requiredCount: requiredHeaders.length,
    missingHeaders: missingHeaders(requiredHeaders, candidate)
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
  return {
    ok: true,
    headerRowIndex: selected.rowIndex,
    headerRowNumber: selected.rowNumber,
    headers: selected.headers,
    columnIndex: selected.columnIndex,
    matchedCount: selected.matchedHeaders.size
  };
}
