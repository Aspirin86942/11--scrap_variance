import { describe, expect, it } from "vitest";
import { getActiveSheet, getSelectedRowNumber, insertRowsBelow, deleteRows } from "../../src/wps-api/active-context";
import type { ScrapVarianceGlobal, WpsSheet } from "../../src/types/wps";
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

  it("falls back to Range insert and delete when EntireRow is unavailable", () => {
    const operations: string[] = [];
    const sheet: WpsSheet = {
      Name: "OA视角单据对比",
      Range(address: string) {
        return {
          Insert(): void {
            operations.push(`insert:${address}`);
          },
          Delete(): void {
            operations.push(`delete:${address}`);
          }
        };
      }
    };

    insertRowsBelow(sheet, 6, 3);
    deleteRows(sheet, 7, 2);

    expect(operations).toEqual(["insert:7:9", "delete:7:8"]);
  });

  it("rejects invalid selected rows", () => {
    const root: ScrapVarianceGlobal = { Application: createFakeApplication([]) };
    root.Application!.Selection = { Row: 0 };

    expect(() => getSelectedRowNumber(root)).toThrow("当前选区无法识别为有效单据行。");
  });
});
