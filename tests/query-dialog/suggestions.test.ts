import { describe, expect, it, vi } from "vitest";
import { ERP_REQUIRED_HEADERS, OA_REQUIRED_HEADERS, SHEET_NAMES } from "../../src/constants";
import {
  EMPTY_QUERY_DIALOG_SUGGESTIONS,
  buildQueryDialogSuggestions
} from "../../src/query-dialog/suggestions";
import type { ScrapVarianceGlobal } from "../../src/types/wps";
import { createFakeApplication, createFakeSheet } from "../wps-api/fakes";

function makeRoot(): ScrapVarianceGlobal {
  const oaSheet = createFakeSheet(SHEET_NAMES.oa, [
    [...OA_REQUIRED_HEADERS],
    ["OA-001", "ERP-001", "2026/5/1", "数控", "生产", "仓储", "MAT-A", "物料A", 1, 10],
    ["OA-002", "ERP-002", "2026/5/2", "数控", "生产", "机加", "MAT-B", "物料B", 2, 20],
    ["OA-003", "ERP-003", "2026/5/3", "  ", "质量", "", "MAT-C", "物料C", 3, 30]
  ]);
  const erpSheet = createFakeSheet(SHEET_NAMES.erp, [
    [...ERP_REQUIRED_HEADERS],
    ["ERP-001", "2026/5/1", "OA-001", "数控", "生产", "仓储", "MAT-A", "物料A", 1, 10],
    ["ERP-004", "2026/5/4", "OA-004", "装备", "售后", "维修", "MAT-D", "物料D", 4, 40],
    ["ERP-005", "2026/5/5", "OA-005", "", "生产", "仓储", "MAT-E", "物料E", 5, 50]
  ]);

  return {
    Application: createFakeApplication([oaSheet, erpSheet])
  };
}

describe("query dialog suggestions", () => {
  it("builds unique sorted company and department suggestions from OA and ERP source sheets", () => {
    expect(buildQueryDialogSuggestions(makeRoot())).toEqual({
      company: ["数控", "装备"],
      dept1: ["生产", "售后", "质量"],
      dept2: ["仓储", "机加", "维修"]
    });
  });

  it("returns empty suggestions and logs when source sheets cannot be read", () => {
    const error = vi.fn();
    const root: ScrapVarianceGlobal = {
      Application: createFakeApplication([]),
      console: { error, log: vi.fn() }
    };

    expect(buildQueryDialogSuggestions(root)).toEqual(EMPTY_QUERY_DIALOG_SUGGESTIONS);
    expect(error).toHaveBeenCalledWith(
      "读取查询候选失败，查询弹窗将不显示补全下拉。",
      expect.any(Error)
    );
  });

  it("returns a fresh empty suggestion result after failure so caller mutation cannot pollute later failures", () => {
    const root: ScrapVarianceGlobal = {
      Application: createFakeApplication([]),
      console: { error: vi.fn(), log: vi.fn() }
    };

    const firstResult = buildQueryDialogSuggestions(root);
    firstResult.company.push("污染值");

    const secondResult = buildQueryDialogSuggestions(root);

    expect(secondResult).toEqual(EMPTY_QUERY_DIALOG_SUGGESTIONS);
    expect(secondResult.company).not.toContain("污染值");
    expect(secondResult).not.toBe(firstResult);
    expect(secondResult.company).not.toBe(firstResult.company);
    expect(secondResult.dept1).not.toBe(firstResult.dept1);
    expect(secondResult.dept2).not.toBe(firstResult.dept2);
  });

  it("returns empty suggestions and logs when source sheets exist but UsedRange is unreadable", () => {
    const error = vi.fn();
    const root: ScrapVarianceGlobal = {
      Application: createFakeApplication([createFakeSheet(SHEET_NAMES.oa), createFakeSheet(SHEET_NAMES.erp)]),
      console: { error, log: vi.fn() }
    };

    expect(buildQueryDialogSuggestions(root)).toEqual(EMPTY_QUERY_DIALOG_SUGGESTIONS);
    expect(error).toHaveBeenCalledWith(
      "读取查询候选失败，查询弹窗将不显示补全下拉。",
      expect.any(Error)
    );
  });

  it("logs through global console when default-root suggestion reads fail", () => {
    vi.stubGlobal("Application", createFakeApplication([]));
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      expect(buildQueryDialogSuggestions()).toEqual(EMPTY_QUERY_DIALOG_SUGGESTIONS);
      expect(error).toHaveBeenCalledWith(
        "读取查询候选失败，查询弹窗将不显示补全下拉。",
        expect.any(Error)
      );
    } finally {
      error.mockRestore();
      vi.unstubAllGlobals();
    }
  });
});
