import { describe, expect, it } from "vitest";
import type { WpsSheet } from "../../src/types/wps";
import {
  adjustOutputMetadataRows,
  saveOutputMetadata,
  readOutputMetadata,
  clearPreviousToolOutput
} from "../../src/wps-api/output-metadata";
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

  it("reads metadata from Value when Value2 is unavailable", () => {
    const sheet: WpsSheet = {
      Name: "OA视角单据对比",
      Range() {
        return {
          Value: [["oa_doc_compare", "A1:P3"]]
        };
      }
    };

    expect(readOutputMetadata(sheet)).toEqual({ kind: "oa_doc_compare", rangeAddress: "A1:P3" });
  });

  it("ignores invalid metadata and never clears unsafe ranges", () => {
    const invalidKind = createFakeSheet("OA视角单据对比");
    const invalidAddress = createFakeSheet("OA视角单据对比");
    const invalidShape = createFakeSheet("OA视角单据对比");
    invalidKind.rangeValues.set("CB1:CC1", [["missing_kind", "A1:P3"]]);
    invalidAddress.rangeValues.set("CB1:CC1", [["oa_doc_compare", "1:1048576"]]);
    invalidShape.rangeValues.set("CB1:CC1", [["oa_doc_compare"]]);

    expect(readOutputMetadata(invalidKind)).toBeNull();
    expect(readOutputMetadata(invalidAddress)).toBeNull();
    expect(readOutputMetadata(invalidShape)).toBeNull();

    clearPreviousToolOutput(invalidKind, "oa_doc_compare");
    clearPreviousToolOutput(invalidAddress, "oa_doc_compare");
    clearPreviousToolOutput(invalidShape, "oa_doc_compare");

    expect(invalidKind.clears).toEqual([]);
    expect(invalidAddress.clears).toEqual([]);
    expect(invalidShape.clears).toEqual([]);
  });

  it("adjusts recorded output range rows without crossing the start row", () => {
    const sheet = createFakeSheet("OA视角单据对比");
    saveOutputMetadata(sheet, { kind: "oa_doc_compare", rangeAddress: "A1:P3" });

    adjustOutputMetadataRows(sheet, 2);
    expect(readOutputMetadata(sheet)).toEqual({ kind: "oa_doc_compare", rangeAddress: "A1:P5" });

    adjustOutputMetadataRows(sheet, -10);
    expect(readOutputMetadata(sheet)).toEqual({ kind: "oa_doc_compare", rangeAddress: "A1:P1" });
  });

  it("does not adjust missing or invalid output metadata", () => {
    const missing = createFakeSheet("OA视角单据对比");
    const invalid = createFakeSheet("OA视角单据对比");
    invalid.rangeValues.set("CB1:CC1", [["oa_doc_compare", "1:1048576"]]);

    adjustOutputMetadataRows(missing, 1);
    adjustOutputMetadataRows(invalid, 1);

    expect(missing.writes).toEqual([]);
    expect(invalid.writes).toEqual([]);
  });
});
