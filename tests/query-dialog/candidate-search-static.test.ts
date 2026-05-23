/// <reference types="node" />

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(__dirname, "..", "..");

interface CandidateSearchApi {
  normalizeStringValues(input: unknown): string[];
  buildIndex<T>(values: T[], getSearchText: (value: T) => string): unknown;
  searchIndex<T>(index: unknown, query: string, limit: number): T[];
}

function loadCandidateSearch(): CandidateSearchApi {
  const tests = {} as CandidateSearchApi;
  const windowObject = {
    __SCRAP_VARIANCE_CANDIDATE_SEARCH_TESTS__: tests
  };
  const context = vm.createContext({
    window: windowObject
  });

  vm.runInContext(readFileSync(resolve(repoRoot, "ui/candidate-search.js"), "utf-8"), context);

  return tests;
}

describe("static candidate search helper", () => {
  it("normalizes strings by trimming blanks and preserving first occurrence order", () => {
    const api = loadCandidateSearch();

    expect(api.normalizeStringValues([" 数控 ", "", "数控", null, "装备", "  ", "售后"])).toEqual([
      "数控",
      "装备",
      "售后"
    ]);
  });

  it("uses 2-gram search for middle substring matches while preserving original order", () => {
    const api = loadCandidateSearch();
    const index = api.buildIndex(["生产部门1", "质量中心", "生产部门2", "售后服务"], (value) => value);

    expect(api.searchIndex<string>(index, "产部", 30)).toEqual(["生产部门1", "生产部门2"]);
    expect(api.searchIndex<string>(index, "量中", 30)).toEqual(["质量中心"]);
  });

  it("caps empty and single-character searches without ranking or reordering", () => {
    const api = loadCandidateSearch();
    const values = Array.from({ length: 35 }, (_, index) => `生产部门${index + 1}`);
    const index = api.buildIndex(values, (value) => value);

    expect(api.searchIndex<string>(index, "", 30)).toEqual(values.slice(0, 30));
    expect(api.searchIndex<string>(index, "部", 30)).toEqual(values.slice(0, 30));
  });

  it("indexes only the caller-provided search text for object candidates", () => {
    const api = loadCandidateSearch();
    const values = [
      { docNumber: "OA-001", label: "OA-001 | 2026-05-01 | 数控 | ERP: ERP-778" },
      { docNumber: "OA-002", label: "OA-002 | 2026-05-02 | 装备 | ERP: ERP-999" }
    ];
    const index = api.buildIndex(values, (value) => value.docNumber);

    expect(api.searchIndex<typeof values[number]>(index, "A-00", 30).map((item) => item.docNumber)).toEqual([
      "OA-001",
      "OA-002"
    ]);
    expect(api.searchIndex<typeof values[number]>(index, "数控", 30)).toEqual([]);
    expect(api.searchIndex<typeof values[number]>(index, "ERP-778", 30)).toEqual([]);
  });
});
