export const SHEET_NAMES = {
  oa: "查询OA-存货报废申请单",
  erp: "查询ERP-报废明细表",
  panel: "查询面板",
  precheckResult: "预验证结果"
} as const;

export const OA_REQUIRED_HEADERS = [
  "表单编号",
  "申请日期",
  "公司简称",
  "一级部门",
  "二级部门",
  "物料代码",
  "物料名称",
  "数量",
  "实际预算金额mx"
] as const;

export const ERP_REQUIRED_HEADERS = [
  "单据编号",
  "日期",
  "源单单号",
  "区分公司简称",
  "一级部门",
  "二级部门",
  "物料编码",
  "物料名称",
  "实发数量",
  "总成本"
] as const;

export const SUMMARY_HEADERS = [
  "公司简称",
  "一级部门",
  "二级部门",
  "OA数量合计",
  "ERP实发数量合计",
  "数量差额",
  "OA实际预算金额mx合计",
  "ERP总成本合计",
  "金额差额",
  "差异类型摘要"
] as const;

export const DETAIL_HEADERS = [
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
  "备注"
] as const;

export const PRECHECK_HEADERS = [
  "级别",
  "数据源",
  "行号",
  "字段名",
  "原值",
  "问题类型",
  "原因",
  "处理建议"
] as const;

export const DIFFERENCE_TYPE_PRIORITY = [
  "OA有申请，ERP无出库",
  "ERP出库对应OA未在当前OA数据中找到",
  "OA和ERP都有，但物料明细不一致",
  "OA和ERP都有，但数量不同",
  "OA和ERP都有，数量一致"
] as const;

export const MAX_HEADER_SCAN_ROWS = 20;
export const MIN_OA_HEADER_MATCH_COUNT = 5;
export const MIN_ERP_HEADER_MATCH_COUNT = 5;
export const MAX_OUTPUT_CLEAR_ROW = 200000;
export const MAX_PRECHECK_CLEAR_ROW = 200000;
export const WRITE_CHUNK_ROWS = 1000;
