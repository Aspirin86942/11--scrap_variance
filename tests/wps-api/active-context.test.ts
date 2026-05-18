import { describe, expect, it } from "vitest";
import { getActiveSheet, getSelectedRowNumber, insertRowsBelow, deleteRows } from "../../src/wps-api/active-context";
import type { ScrapVarianceGlobal } from "../../src/types/wps";
import { createFakeApplication, createFakeSheet } from "./fakes";

describe("active WPS context", () => {
  it("returns the active sheet when WPS exposes ActiveSheet", () => {
    const active = createFakeSheet("OA视角单据对比");
    const root: ScrapVarianceGlobal = { Application: createFakeApplication([active]) };
    root.Application!.ActiveSheet = active;

    expect(getActiveSheet(root)).toBe(active);
  });

  it("returns selected row number from Selection.Row", () => {
    const root: ScrapVarianceGlobal = { Application: createFakeApplication([]) };
    root.Application!.Selection = { Row: 12 };

    expect(getSelectedRowNumber(root)).toBe(12);
  });

  it("records row insert and delete operations through the fake sheet", () => {
    const sheet = createFakeSheet("OA视角单据对比");

    insertRowsBelow(sheet, 3, 2);
    deleteRows(sheet, 4, 2);

    expect(sheet.rowInserts).toEqual([{ afterRow: 3, rowCount: 2 }]);
    expect(sheet.rowDeletes).toEqual([{ startRow: 4, rowCount: 2 }]);
  });
});
