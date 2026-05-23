import { describe, expect, it } from "vitest";
import { SHEET_NAMES } from "../../src/constants";
import {
  OUTPUT_SHEET_KINDS,
  detectOutputSheetKind,
  unsupportedOutputSheetMessage
} from "../../src/core/output-sheets";

describe("output sheet detection", () => {
  it("detects the three supported output sheets", () => {
    expect(detectOutputSheetKind(SHEET_NAMES.varianceSummary)).toBe(OUTPUT_SHEET_KINDS.varianceSummary);
    expect(detectOutputSheetKind(SHEET_NAMES.oaDocCompare)).toBe(OUTPUT_SHEET_KINDS.oaDocCompare);
    expect(detectOutputSheetKind(SHEET_NAMES.erpDocCompare)).toBe(OUTPUT_SHEET_KINDS.erpDocCompare);
  });

  it("does not treat source or diagnostics sheets as output sheets", () => {
    expect(detectOutputSheetKind(SHEET_NAMES.oa)).toBeNull();
    expect(detectOutputSheetKind(SHEET_NAMES.erp)).toBeNull();
    expect(detectOutputSheetKind(SHEET_NAMES.performanceDiagnostics)).toBeNull();
    expect(detectOutputSheetKind(SHEET_NAMES.legacyDetailOutput)).toBeNull();
    expect(detectOutputSheetKind(SHEET_NAMES.documentLookup)).toBeNull();
    expect(detectOutputSheetKind("Sheet1")).toBeNull();
  });

  it("returns the exact unsupported-sheet guidance", () => {
    expect(unsupportedOutputSheetMessage()).toBe(
      "当前工作表不支持查询或展开，请切换到 报废差异汇总、OA视角单据对比 或 ERP视角单据对比。"
    );
  });
});
