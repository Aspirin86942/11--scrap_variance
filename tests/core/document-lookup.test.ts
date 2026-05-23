import { describe, expect, it } from "vitest";
import {
  buildDocumentLookupResult,
  buildDocumentLookupSuggestions,
  documentLookupRowsToValues
} from "../../src/core/document-lookup";
import type { RawRow } from "../../src/types/scrap";

function oaRow(overrides: Partial<RawRow> = {}): RawRow {
  return {
    表单编号: "OA-001",
    金蝶云单据编号: "ERP-001",
    申请日期: "2026/5/1",
    公司简称: "数控",
    一级部门: "生产",
    二级部门: "仓储",
    物料代码: "MAT-A",
    物料名称: "物料A",
    数量: 1,
    实际预算金额mx: 10,
    ...overrides
  };
}

function erpRow(overrides: Partial<RawRow> = {}): RawRow {
  return {
    单据编号: "ERP-001",
    日期: "2026/5/2",
    源单单号: "OA-001",
    区分公司简称: "数控",
    一级部门: "生产",
    二级部门: "仓储",
    物料编码: "MAT-A",
    物料名称: "物料A",
    实发数量: 1,
    总成本: 10,
    ...overrides
  };
}

describe("document lookup core", () => {
  it("builds deduplicated OA and ERP suggestions with context labels", () => {
    const suggestions = buildDocumentLookupSuggestions(
      [
        oaRow({ 物料代码: "MAT-A", 金蝶云单据编号: "ERP-001" }),
        oaRow({ 物料代码: "MAT-B", 金蝶云单据编号: "ERP-002", 二级部门: "装配" })
      ],
      [
        erpRow({ 物料编码: "MAT-A", 源单单号: "OA-001" }),
        erpRow({ 物料编码: "MAT-B", 源单单号: "OA-002", 日期: "2026/5/3" })
      ]
    );

    expect(suggestions.oa).toEqual([
      {
        mode: "oa_form_number",
        docNumber: "OA-001",
        label: "OA-001 | 2026-05-01 | 数控 | 生产/仓储,生产/装配 | ERP: ERP-001,ERP-002"
      }
    ]);
    expect(suggestions.erp).toEqual([
      {
        mode: "erp_doc_number",
        docNumber: "ERP-001",
        label: "ERP-001 | 2026-05-02,2026-05-03 | 数控 | 生产/仓储 | OA: OA-001,OA-002"
      }
    ]);
  });

  it("looks up one OA form and pairs materials against linked ERP documents", () => {
    const result = buildDocumentLookupResult({
      mode: "oa_form_number",
      docNumber: "OA-001",
      oaRows: [
        oaRow({ 物料代码: "MAT-A", 数量: 1, 实际预算金额mx: 10 }),
        oaRow({ 物料代码: "MAT-A", 数量: 2, 实际预算金额mx: 20 }),
        oaRow({ 物料代码: "MAT-B", 物料名称: "物料B", 数量: 5, 实际预算金额mx: 50 })
      ],
      erpRows: [
        erpRow({ 物料编码: "MAT-A", 实发数量: 2, 总成本: 25 }),
        erpRow({ 物料编码: "MAT-C", 物料名称: "物料C", 实发数量: 7, 总成本: 70 })
      ]
    });

    expect(result).toEqual({
      ok: true,
      rows: [
        expect.objectContaining({
          rowType: "物料",
          lookupType: "查OA表单编号",
          matchedDocNumber: "OA-001",
          oaItemCode: "MAT-A",
          erpItemCode: "MAT-A",
          oaQuantity: 3,
          erpQuantity: 2,
          quantityDiff: 1,
          amountDiff: 5,
          remark: "数量不同"
        }),
        expect.objectContaining({
          oaItemCode: "MAT-B",
          erpItemCode: "",
          remark: "ERP缺少该物料"
        }),
        expect.objectContaining({
          oaItemCode: "",
          erpItemCode: "MAT-C",
          remark: "OA缺少该物料"
        })
      ]
    });
  });

  it("looks up one ERP document and pairs materials against linked OA forms", () => {
    const result = buildDocumentLookupResult({
      mode: "erp_doc_number",
      docNumber: "ERP-001",
      oaRows: [
        oaRow({ 表单编号: "OA-001", 物料代码: "MAT-A", 数量: 1, 实际预算金额mx: 10 }),
        oaRow({ 表单编号: "OA-002", 物料代码: "MAT-B", 物料名称: "物料B", 数量: 3, 实际预算金额mx: 30 })
      ],
      erpRows: [
        erpRow({ 源单单号: "OA-001", 物料编码: "MAT-A", 实发数量: 1, 总成本: 10 }),
        erpRow({ 源单单号: "OA-002", 物料编码: "MAT-B", 物料名称: "物料B", 实发数量: 4, 总成本: 40 })
      ]
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.rows.map((row) => [row.oaItemCode, row.erpItemCode, row.remark])).toEqual([
        ["MAT-A", "MAT-A", "数量一致"],
        ["MAT-B", "MAT-B", "数量不同"]
      ]);
    }
  });

  it("uses displayed two-decimal quantity difference when deciding equality remark", () => {
    const result = buildDocumentLookupResult({
      mode: "oa_form_number",
      docNumber: "OA-001",
      oaRows: [oaRow({ 数量: "1.004" })],
      erpRows: [erpRow({ 实发数量: "1.003" })]
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.rows[0]).toMatchObject({
        oaQuantity: 1,
        erpQuantity: 1,
        quantityDiff: 0,
        remark: "数量一致"
      });
    }
  });

  it("keeps missing item-code rows visible as auditable unpaired rows", () => {
    const result = buildDocumentLookupResult({
      mode: "oa_form_number",
      docNumber: "OA-001",
      oaRows: [oaRow({ 物料代码: "", 物料名称: "OA无编码物料", 数量: 2, 实际预算金额mx: 20 })],
      erpRows: [erpRow({ 物料编码: "", 物料名称: "ERP无编码物料", 实发数量: 3, 总成本: 30 })]
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.rows).toEqual([
        expect.objectContaining({
          oaItemCode: "",
          oaItemName: "OA无编码物料",
          oaQuantity: 2,
          oaAmount: 20,
          erpItemCode: "",
          erpQuantity: 0,
          erpAmount: 0,
          remark: "OA物料编码为空，无法配对"
        }),
        expect.objectContaining({
          oaItemCode: "",
          oaQuantity: 0,
          oaAmount: 0,
          erpItemCode: "",
          erpItemName: "ERP无编码物料",
          erpQuantity: 3,
          erpAmount: 30,
          remark: "ERP物料编码为空，无法配对"
        })
      ]);
    }
  });

  it("keeps each missing item-code source row separate instead of aggregating them", () => {
    const result = buildDocumentLookupResult({
      mode: "oa_form_number",
      docNumber: "OA-001",
      oaRows: [
        oaRow({ 物料代码: "", 物料名称: "OA无编码物料A", 数量: 2, 实际预算金额mx: 20 }),
        oaRow({ 物料代码: "", 物料名称: "OA无编码物料B", 数量: 5, 实际预算金额mx: 50 })
      ],
      erpRows: [
        erpRow({ 物料编码: "", 物料名称: "ERP无编码物料A", 实发数量: 3, 总成本: 30 }),
        erpRow({ 物料编码: "", 物料名称: "ERP无编码物料B", 实发数量: 7, 总成本: 70 })
      ]
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.rows).toEqual([
        expect.objectContaining({
          oaItemName: "OA无编码物料A",
          oaQuantity: 2,
          oaAmount: 20,
          erpItemName: "",
          erpQuantity: 0,
          erpAmount: 0,
          remark: "OA物料编码为空，无法配对"
        }),
        expect.objectContaining({
          oaItemName: "OA无编码物料B",
          oaQuantity: 5,
          oaAmount: 50,
          erpItemName: "",
          erpQuantity: 0,
          erpAmount: 0,
          remark: "OA物料编码为空，无法配对"
        }),
        expect.objectContaining({
          oaItemName: "",
          oaQuantity: 0,
          oaAmount: 0,
          erpItemName: "ERP无编码物料A",
          erpQuantity: 3,
          erpAmount: 30,
          remark: "ERP物料编码为空，无法配对"
        }),
        expect.objectContaining({
          oaItemName: "",
          oaQuantity: 0,
          oaAmount: 0,
          erpItemName: "ERP无编码物料B",
          erpQuantity: 7,
          erpAmount: 70,
          remark: "ERP物料编码为空，无法配对"
        })
      ]);
    }
  });

  it("keeps main OA materials when linked ERP document is missing", () => {
    const result = buildDocumentLookupResult({
      mode: "oa_form_number",
      docNumber: "OA-001",
      oaRows: [oaRow({ 金蝶云单据编号: "ERP-MISSING" })],
      erpRows: []
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]).toMatchObject({
        oaFormNumber: "OA-001",
        erpDocNumber: "",
        remark: "未找到对应ERP单据"
      });
    }
  });

  it("returns a readable no-result message when the selected main document disappears", () => {
    expect(
      buildDocumentLookupResult({
        mode: "oa_form_number",
        docNumber: "OA-MISSING",
        oaRows: [oaRow()],
        erpRows: [erpRow()]
      })
    ).toEqual({ ok: false, message: "未找到OA表单编号：OA-MISSING" });

    expect(
      buildDocumentLookupResult({
        mode: "erp_doc_number",
        docNumber: "ERP-MISSING",
        oaRows: [oaRow()],
        erpRows: [erpRow()]
      })
    ).toEqual({ ok: false, message: "未找到ERP单据编号：ERP-MISSING" });
  });

  it("omits empty counterpart prefixes from suggestion labels", () => {
    const suggestions = buildDocumentLookupSuggestions(
      [oaRow({ 金蝶云单据编号: "" })],
      [erpRow({ 源单单号: "" })]
    );

    expect(suggestions.oa[0].label).toBe("OA-001 | 2026-05-01 | 数控 | 生产/仓储");
    expect(suggestions.oa[0].label).not.toContain("ERP:");
    expect(suggestions.erp[0].label).toBe("ERP-001 | 2026-05-02 | 数控 | 生产/仓储");
    expect(suggestions.erp[0].label).not.toContain("OA:");
  });

  it("converts lookup rows to the fixed worksheet header order", () => {
    const result = buildDocumentLookupResult({
      mode: "oa_form_number",
      docNumber: "OA-001",
      oaRows: [oaRow()],
      erpRows: [erpRow()]
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(documentLookupRowsToValues(result.rows)[0]).toEqual([
        "行类型",
        "查询类型",
        "命中单号",
        "OA表单编号",
        "OA记录的ERP单号",
        "OA申请日期",
        "OA公司简称",
        "OA一级部门",
        "OA二级部门",
        "OA物料编码",
        "OA物料名称",
        "OA数量",
        "OA金额",
        "ERP单据编号",
        "ERP记录的OA单号",
        "ERP日期",
        "ERP公司简称",
        "ERP一级部门",
        "ERP二级部门",
        "ERP物料编码",
        "ERP物料名称",
        "ERP数量",
        "ERP金额",
        "数量差额",
        "金额差额",
        "备注"
      ]);
    }
  });
});
