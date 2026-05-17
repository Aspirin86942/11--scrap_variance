const assert = require("node:assert/strict");
const test = require("node:test");

const { ScrapVarianceCore: core } = require("../src/scrap_variance_query.js");

test("normalizeNumber keeps valid numeric inputs and rejects invalid text", () => {
  assert.equal(core.normalizeNumber(null), 0);
  assert.equal(core.normalizeNumber(undefined), 0);
  assert.equal(core.normalizeNumber(""), 0);
  assert.equal(core.normalizeNumber(12.5), 12.5);
  assert.equal(core.normalizeNumber("1,234.56"), 1234.56);
  assert.throws(
    () => core.normalizeNumber("abc"),
    /数值格式不正确：abc/
  );
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
