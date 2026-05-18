import { describe, expect, it } from "vitest";
import { saveOutputMetadata, readOutputMetadata, clearPreviousToolOutput } from "../../src/wps-api/output-metadata";
import { createFakeSheet } from "./fakes";

describe("output metadata", () => {
  it("stores and reads the previous tool output range", () => {
    const sheet = createFakeSheet("OA视角单据对比");

    saveOutputMetadata(sheet, { kind: "oa_doc_compare", rangeAddress: "A1:P3" });

    expect(readOutputMetadata(sheet)).toEqual({ kind: "oa_doc_compare", rangeAddress: "A1:P3" });
  });

  it("clears only the metadata range", () => {
    const sheet = createFakeSheet("OA视角单据对比");
    saveOutputMetadata(sheet, { kind: "oa_doc_compare", rangeAddress: "A1:P3" });

    clearPreviousToolOutput(sheet, "oa_doc_compare");

    expect(sheet.clears).toEqual(["A1:P3"]);
  });

  it("does not clear when metadata is missing or for another output kind", () => {
    const missing = createFakeSheet("OA视角单据对比");
    const other = createFakeSheet("ERP视角单据对比");
    saveOutputMetadata(other, { kind: "erp_doc_compare", rangeAddress: "A1:P4" });

    clearPreviousToolOutput(missing, "oa_doc_compare");
    clearPreviousToolOutput(other, "oa_doc_compare");

    expect(missing.clears).toEqual([]);
    expect(other.clears).toEqual([]);
  });
});
