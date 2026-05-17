const assert = require("node:assert/strict");
const test = require("node:test");

const { ScrapVarianceCore: core } = require("../src/scrap_variance_query.js");

test("normalizeNumber keeps valid numeric inputs and rejects invalid text", () => {
  assert.equal(core.normalizeNumber(null), 0);
  assert.equal(core.normalizeNumber(undefined), 0);
  assert.equal(core.normalizeNumber(""), 0);
  assert.equal(core.normalizeNumber(12.5), 12.5);
  assert.equal(core.normalizeNumber("1,234"), 1234);
  assert.equal(core.normalizeNumber("1,234.56"), 1234.56);
  assert.throws(
    () => core.normalizeNumber("abc"),
    /数值格式不正确：abc/
  );
});

test("normalizeNumber rejects malformed comma numeric text", () => {
  const malformedValues = [",", ",,", "1,", ",1", "1,,2"];

  for (const value of malformedValues) {
    assert.throws(
      () => core.normalizeNumber(value),
      new RegExp("数值格式不正确：" + value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    );
  }
});

test("normalizeDateKey normalizes supported date values and rejects invalid dates", () => {
  assert.equal(core.normalizeDateKey(""), "");
  assert.equal(core.normalizeDateKey(new Date(2026, 4, 1)), "2026-05-01");
  assert.equal(core.normalizeDateKey(45000), "2023-03-15");
  assert.equal(core.normalizeDateKey("2026.5.1 15:03:09"), "2026-05-01");
  assert.throws(
    () => core.normalizeDateKey("2026/2/30"),
    /日期格式不正确/
  );
  assert.throws(
    () => core.normalizeDateKey("2026-05-01abc"),
    /日期格式不正确/
  );
  assert.throws(
    () => core.normalizeDateKey("2026/5/1foo"),
    /日期格式不正确/
  );
});

test("parseFilters rejects a start date later than the end date", () => {
  assert.throws(
    () =>
      core.parseFilters({
        startDate: "2026-06-01",
        endDate: "2026-05-01",
      }),
    /开始日期不能晚于结束日期/
  );
});

test("buildOaRows filters OA rows and groups by OA form plus material", () => {
  const filters = core.parseFilters({
    company: "数控",
    dept1: "生产运营中心",
    dept2: "仓储部",
    startDate: "2026-05-01",
    endDate: "2026-05-31",
  });
  const rows = [
    {
      表单编号: "CHBF2026050001",
      申请日期: "2026/5/1",
      公司简称: "数控",
      一级部门: "生产运营中心",
      二级部门: "仓储部",
      物料代码: "MAT-A",
      物料名称: "物料A",
      数量: 2,
      实际预算金额mx: 10,
    },
    {
      表单编号: "CHBF2026050001",
      申请日期: "2026/5/1",
      公司简称: "数控",
      一级部门: "生产运营中心",
      二级部门: "仓储部",
      物料代码: "MAT-A",
      物料名称: "物料A",
      数量: "3",
      实际预算金额mx: "15",
    },
    {
      表单编号: "CHBF2026050001",
      申请日期: "2026/6/1",
      公司简称: "数控",
      一级部门: "生产运营中心",
      二级部门: "仓储部",
      物料代码: "MAT-B",
      物料名称: "物料B",
      数量: 4,
      实际预算金额mx: 20,
    },
  ];

  const grouped = core.buildOaRows(rows, filters);

  assert.deepEqual(Object.keys(grouped), ["CHBF2026050001||MAT-A"]);
  assert.equal(grouped["CHBF2026050001||MAT-A"].quantity, 5);
  assert.equal(grouped["CHBF2026050001||MAT-A"].amount, 25);
});

test("buildErpRowsForOa groups ERP rows only for selected OA forms", () => {
  const oaGrouped = {
    "CHBF2026050001||MAT-A": {
      formNumber: "CHBF2026050001",
      itemCode: "MAT-A",
    },
  };
  const rows = [
    {
      单据编号: "QOUT1",
      源单单号: "CHBF2026050001",
      物料编码: "MAT-A",
      实发数量: 2,
      总成本: 20,
    },
    {
      单据编号: "QOUT2",
      源单单号: "CHBF2026050001",
      物料编码: "MAT-A",
      实发数量: 3,
      总成本: 30,
    },
    {
      单据编号: "QOUT999",
      源单单号: "CHBF9999999999",
      物料编码: "MAT-Z",
      实发数量: 9,
      总成本: 90,
    },
  ];

  const grouped = core.buildErpRowsForOa(rows, oaGrouped);

  assert.deepEqual(Object.keys(grouped), ["CHBF2026050001||MAT-A"]);
  assert.equal(grouped["CHBF2026050001||MAT-A"].quantity, 5);
  assert.equal(grouped["CHBF2026050001||MAT-A"].cost, 50);
  assert.deepEqual(grouped["CHBF2026050001||MAT-A"].erpDocNumbers, [
    "QOUT1",
    "QOUT2",
  ]);
});

test("buildErpOnlyRows keeps ERP rows whose source OA is not in the full OA export", () => {
  const filters = core.parseFilters({
    company: "数控",
    dept1: "生产运营中心",
    dept2: "仓储部",
    startDate: "2026-05-01",
    endDate: "2026-05-31",
  });
  const allOaFormNumbers = { CHBF2026050001: true };
  const rows = [
    {
      单据编号: "QOUT999",
      日期: "2026/5/4",
      源单单号: "CHBF9999999999",
      区分公司简称: "数控",
      一级部门: "生产运营中心",
      二级部门: "仓储部",
      物料编码: "MAT-Z",
      物料名称: "物料Z",
      实发数量: 7,
      总成本: 70,
    },
    {
      单据编号: "QOUT_OLD",
      日期: "2026/4/30",
      源单单号: "CHBF8888888888",
      区分公司简称: "数控",
      一级部门: "生产运营中心",
      二级部门: "仓储部",
      物料编码: "MAT-X",
      物料名称: "物料X",
      实发数量: 8,
      总成本: 80,
    },
  ];

  const grouped = core.buildErpOnlyRows(rows, allOaFormNumbers, filters);

  assert.deepEqual(Object.keys(grouped), ["CHBF9999999999||MAT-Z"]);
  assert.equal(grouped["CHBF9999999999||MAT-Z"].quantity, 7);
  assert.equal(grouped["CHBF9999999999||MAT-Z"].cost, 70);
});

test("buildErpOnlyRows skips ERP rows with blank source OA form number", () => {
  const filters = core.parseFilters({
    company: "数控",
    dept1: "生产运营中心",
    dept2: "仓储部",
    startDate: "2026-05-01",
    endDate: "2026-05-31",
  });
  const rows = [
    {
      单据编号: "QOUT_BLANK",
      日期: "2026/5/4",
      源单单号: "",
      区分公司简称: "数控",
      一级部门: "生产运营中心",
      二级部门: "仓储部",
      物料编码: "MAT-Z",
      物料名称: "物料Z",
      实发数量: 7,
      总成本: 70,
    },
  ];

  const grouped = core.buildErpOnlyRows(rows, {}, filters);

  assert.deepEqual(Object.keys(grouped), []);
});

test("compareRows emits missing shipment, material mismatch, quantity mismatch, and ERP-only rows", () => {
  const oaGrouped = {
    "CHBF1||MAT-A": {
      formNumber: "CHBF1",
      itemCode: "MAT-A",
      itemName: "物料A",
      company: "数控",
      dept1: "生产运营中心",
      dept2: "仓储部",
      quantity: 5,
      amount: 50,
    },
    "CHBF2||MAT-B": {
      formNumber: "CHBF2",
      itemCode: "MAT-B",
      itemName: "物料B",
      company: "数控",
      dept1: "生产运营中心",
      dept2: "仓储部",
      quantity: 3,
      amount: 30,
    },
    "CHBF3||MAT-C": {
      formNumber: "CHBF3",
      itemCode: "MAT-C",
      itemName: "物料C",
      company: "数控",
      dept1: "生产运营中心",
      dept2: "仓储部",
      quantity: 4,
      amount: 40,
    },
  };

  const erpForOa = {
    "CHBF1||MAT-A": {
      sourceFormNumber: "CHBF1",
      formNumber: "CHBF1",
      itemCode: "MAT-A",
      itemName: "物料A",
      company: "数控",
      dept1: "生产运营中心",
      dept2: "仓储部",
      quantity: 4,
      cost: 44,
      erpDocNumbers: ["QOUT1"],
    },
    "CHBF2||MAT-X": {
      sourceFormNumber: "CHBF2",
      formNumber: "CHBF2",
      itemCode: "MAT-X",
      itemName: "物料X",
      company: "数控",
      dept1: "生产运营中心",
      dept2: "仓储部",
      quantity: 3,
      cost: 33,
      erpDocNumbers: ["QOUT2"],
    },
  };

  const erpOnlyRows = {
    "CHBF999||MAT-Z": {
      sourceFormNumber: "CHBF999",
      formNumber: "CHBF999",
      itemCode: "MAT-Z",
      itemName: "物料Z",
      company: "数控",
      dept1: "生产运营中心",
      dept2: "仓储部",
      quantity: 7,
      cost: 77,
      erpDocNumbers: ["QOUT999"],
    },
  };

  const details = core.compareRows(oaGrouped, erpForOa, erpOnlyRows);
  const erpOnlyDetail = details.find((row) => row.formNumber === "CHBF999");

  assert.equal(
    details.find((row) => row.formNumber === "CHBF1").differenceType,
    "OA和ERP都有，但数量不同",
  );
  assert.equal(
    details.find((row) => row.formNumber === "CHBF2" && row.itemCode === "MAT-B").differenceType,
    "OA和ERP都有，但物料明细不一致",
  );
  assert.equal(
    details.find((row) => row.formNumber === "CHBF2" && row.itemCode === "MAT-X").differenceType,
    "OA和ERP都有，但物料明细不一致",
  );
  assert.equal(
    details.find((row) => row.formNumber === "CHBF3").differenceType,
    "OA有申请，ERP无出库",
  );
  assert.equal(
    erpOnlyDetail.differenceType,
    "ERP出库对应OA未在当前OA数据中找到",
  );
  assert.equal(erpOnlyDetail.formNumber, "CHBF999");
  assert.equal(erpOnlyDetail.erpDocNumbers, "QOUT999");
  assert.equal(erpOnlyDetail.remark, "请用 ERP 源单单号回 OA 系统补查。");
});

test("compareRows treats missing material as mismatch when the same OA form has ERP rows", () => {
  const oaGrouped = {
    "CHBF10||MAT-A": {
      formNumber: "CHBF10",
      itemCode: "MAT-A",
      itemName: "物料A",
      company: "数控",
      dept1: "生产运营中心",
      dept2: "仓储部",
      quantity: 1,
      amount: 10,
    },
    "CHBF10||MAT-B": {
      formNumber: "CHBF10",
      itemCode: "MAT-B",
      itemName: "物料B",
      company: "数控",
      dept1: "生产运营中心",
      dept2: "仓储部",
      quantity: 2,
      amount: 20,
    },
  };
  const erpForOa = {
    "CHBF10||MAT-A": {
      sourceFormNumber: "CHBF10",
      formNumber: "CHBF10",
      itemCode: "MAT-A",
      itemName: "物料A",
      company: "数控",
      dept1: "生产运营中心",
      dept2: "仓储部",
      quantity: 1,
      cost: 10,
      erpDocNumbers: ["QOUT10"],
    },
  };

  const details = core.compareRows(oaGrouped, erpForOa, {});
  const matched = details.find(
    (row) => row.formNumber === "CHBF10" && row.itemCode === "MAT-A"
  );
  const missingMaterial = details.find(
    (row) => row.formNumber === "CHBF10" && row.itemCode === "MAT-B"
  );

  assert.equal(matched.differenceType, "OA和ERP都有，数量一致");
  assert.equal(missingMaterial.differenceType, "OA和ERP都有，但物料明细不一致");
});

test("buildSummaryRows aggregates quantities, amounts, costs, and difference type summaries", () => {
  const detailRows = [
    {
      differenceType: "OA和ERP都有，但数量不同",
      company: "数控",
      dept1: "生产运营中心",
      dept2: "仓储部",
      oaQuantity: 5,
      erpQuantity: 4,
      oaAmount: 50,
      erpCost: 44,
    },
    {
      differenceType: "OA有申请，ERP无出库",
      company: "数控",
      dept1: "生产运营中心",
      dept2: "仓储部",
      oaQuantity: 3,
      erpQuantity: 0,
      oaAmount: 30,
      erpCost: 0,
    },
  ];

  const summary = core.buildSummaryRows(detailRows);

  assert.equal(summary.length, 1);
  assert.equal(summary[0].company, "数控");
  assert.equal(summary[0].oaQuantity, 8);
  assert.equal(summary[0].erpQuantity, 4);
  assert.equal(summary[0].quantityDiff, 4);
  assert.equal(summary[0].oaAmount, 80);
  assert.equal(summary[0].erpCost, 44);
  assert.equal(summary[0].amountDiff, 36);
  assert.equal(summary[0].differenceSummary, "OA有申请，ERP无出库、OA和ERP都有，但数量不同");
});

test("buildSummaryRows de-duplicates difference types, uses priority order, and includes matched rows", () => {
  const detailRows = [
    {
      differenceType: "OA和ERP都有，数量一致",
      company: "数控",
      dept1: "生产运营中心",
      dept2: "仓储部",
      oaQuantity: 10,
      erpQuantity: 10,
      oaAmount: 100,
      erpCost: 100,
    },
    {
      differenceType: "OA和ERP都有，但物料明细不一致",
      company: "数控",
      dept1: "生产运营中心",
      dept2: "仓储部",
      oaQuantity: 2,
      erpQuantity: 0,
      oaAmount: 20,
      erpCost: 0,
    },
    {
      differenceType: "OA和ERP都有，但数量不同",
      company: "数控",
      dept1: "生产运营中心",
      dept2: "仓储部",
      oaQuantity: 5,
      erpQuantity: 4,
      oaAmount: 50,
      erpCost: 40,
    },
    {
      differenceType: "ERP出库对应OA未在当前OA数据中找到",
      company: "数控",
      dept1: "生产运营中心",
      dept2: "仓储部",
      oaQuantity: 0,
      erpQuantity: 7,
      oaAmount: 0,
      erpCost: 70,
    },
    {
      differenceType: "OA有申请，ERP无出库",
      company: "数控",
      dept1: "生产运营中心",
      dept2: "仓储部",
      oaQuantity: 3,
      erpQuantity: 0,
      oaAmount: 30,
      erpCost: 0,
    },
    {
      differenceType: "OA和ERP都有，但数量不同",
      company: "数控",
      dept1: "生产运营中心",
      dept2: "仓储部",
      oaQuantity: 1,
      erpQuantity: 2,
      oaAmount: 10,
      erpCost: 20,
    },
  ];

  const summary = core.buildSummaryRows(detailRows);

  assert.equal(summary.length, 1);
  assert.equal(summary[0].oaQuantity, 21);
  assert.equal(summary[0].erpQuantity, 23);
  assert.equal(summary[0].quantityDiff, -2);
  assert.equal(summary[0].oaAmount, 210);
  assert.equal(summary[0].erpCost, 230);
  assert.equal(summary[0].amountDiff, -20);
  assert.equal(
    summary[0].differenceSummary,
    "OA有申请，ERP无出库、ERP出库对应OA未在当前OA数据中找到、OA和ERP都有，但物料明细不一致、OA和ERP都有，但数量不同、OA和ERP都有，数量一致"
  );
});

test("summaryRowsToValues and detailRowsToValues render stable worksheet tables", () => {
  const summaryRows = [
    {
      company: "数控",
      dept1: "生产运营中心",
      dept2: "仓储部",
      oaQuantity: 8,
      erpQuantity: 4,
      quantityDiff: 4,
      oaAmount: 80,
      erpCost: 44,
      amountDiff: 36,
      differenceSummary: "OA和ERP都有，但数量不同",
    },
  ];

  const detailRows = [
    {
      differenceType: "OA和ERP都有，但数量不同",
      formNumber: "CHBF1",
      erpDocNumbers: "QOUT1",
      itemCode: "MAT-A",
      itemName: "物料A",
      company: "数控",
      dept1: "生产运营中心",
      dept2: "仓储部",
      oaQuantity: 5,
      erpQuantity: 4,
      quantityDiff: 1,
      oaAmount: 50,
      erpCost: 44,
      amountDiff: 6,
      remark: "",
    },
  ];

  const summaryValues = core.summaryRowsToValues(summaryRows);
  const detailValues = core.detailRowsToValues(detailRows);

  assert.deepEqual(summaryValues, [
    [
      "公司简称",
      "一级部门",
      "二级部门",
      "OA数量合计",
      "ERP实发数量合计",
      "数量差额",
      "OA实际预算金额mx合计",
      "ERP总成本合计",
      "金额差额",
      "差异类型摘要",
    ],
    [
      "数控",
      "生产运营中心",
      "仓储部",
      8,
      4,
      4,
      80,
      44,
      36,
      "OA和ERP都有，但数量不同",
    ],
  ]);
  assert.deepEqual(detailValues, [
    [
      "差异类型",
      "OA表单编号",
      "ERP出库单号",
      "物料编码",
      "物料名称",
      "公司简称",
      "一级部门",
      "二级部门",
      "OA数量合计",
      "ERP实发数量合计",
      "数量差额",
      "OA实际预算金额mx合计",
      "ERP总成本合计",
      "金额差额",
      "备注",
    ],
    [
      "OA和ERP都有，但数量不同",
      "CHBF1",
      "QOUT1",
      "MAT-A",
      "物料A",
      "数控",
      "生产运营中心",
      "仓储部",
      5,
      4,
      1,
      50,
      44,
      6,
      "",
    ],
  ]);
});

test("rowsFromValues parses rows below a selected header row", () => {
  const values = [
    ["导出条件", "2026-05"],
    ["制表人", "系统"],
    ["表单编号", "数量", ""],
    ["CHBF1", 2, "ignored"],
    ["", "", ""],
  ];

  const rows = core.rowsFromValues(values, 3);

  assert.deepEqual(rows, [{ 表单编号: "CHBF1", 数量: 2 }]);
});
