import type { QueryFilters, RawRow } from "../types/scrap";

export interface BenchmarkDataSet {
  name: string;
  rowCount: number;
  filters: QueryFilters;
  oaRows: RawRow[];
  erpRows: RawRow[];
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, "0");
}

export function formatDatasetName(rowCount: number): string {
  if (rowCount >= 1000 && rowCount % 1000 === 0) {
    return `${rowCount / 1000}k`;
  }
  return String(rowCount);
}

function makeDate(dayOffset: number): string {
  const day = (dayOffset % 28) + 1;
  return `2026-05-${pad(day, 2)}`;
}

function makeOaRow(index: number): RawRow {
  return {
    表单编号: `F${pad(index, 6)}`,
    金蝶云单据编号: `QOUT${pad(index, 6)}`,
    申请日期: makeDate(index),
    公司简称: "数控",
    一级部门: "生产",
    二级部门: "仓储",
    物料代码: `MAT-${pad(index % 500, 4)}`,
    物料名称: `物料${index % 500}`,
    数量: 1,
    实际预算金额mx: 10
  };
}

function makeErpRow(index: number, overrides: Partial<RawRow> = {}): RawRow {
  return {
    单据编号: `QOUT${pad(index, 6)}`,
    日期: makeDate(index + 1),
    源单单号: `F${pad(index, 6)}`,
    区分公司简称: "数控",
    一级部门: "生产",
    二级部门: "仓储",
    物料编码: `MAT-${pad(index % 500, 4)}`,
    物料名称: `物料${index % 500}`,
    实发数量: 1,
    总成本: 10,
    ...overrides
  };
}

export function generateBenchmarkData(rowCount: number): BenchmarkDataSet {
  if (!Number.isInteger(rowCount) || rowCount <= 0) {
    throw new Error(`benchmark 行数必须是正整数：${rowCount}`);
  }

  const oaRows: RawRow[] = [];
  const erpRows: RawRow[] = [];

  for (let index = 0; index < rowCount; index += 1) {
    oaRows.push(makeOaRow(index));

    const scenario = index % 10;
    if (scenario === 0) {
      continue;
    }
    if (scenario === 1) {
      erpRows.push(makeErpRow(index));
      erpRows.push(
        makeErpRow(index, {
          单据编号: `ERPONLY${pad(index, 6)}`,
          源单单号: `ERPONLY${pad(index, 6)}`,
          物料编码: `MAT-ERPONLY-${pad(index % 500, 4)}`
        })
      );
      continue;
    }
    if (scenario === 2) {
      erpRows.push(
        makeErpRow(index, {
          物料编码: `MAT-${pad(index % 500, 4)}-ERP`
        })
      );
      continue;
    }
    if (scenario === 3) {
      erpRows.push(
        makeErpRow(index, {
          实发数量: 2
        })
      );
      continue;
    }

    erpRows.push(makeErpRow(index));
    if (scenario === 4) {
      erpRows.push(
        makeErpRow(index, {
          单据编号: `QOUT${pad(index, 6)}-B`,
          日期: makeDate(index + 2),
          实发数量: 0,
          总成本: 0
        })
      );
    }
  }

  return {
    name: formatDatasetName(rowCount),
    rowCount,
    filters: {
      company: "数控",
      dept1: "生产",
      dept2: "仓储",
      startDate: "2026-05-01",
      endDate: "2026-05-31"
    },
    oaRows,
    erpRows
  };
}
