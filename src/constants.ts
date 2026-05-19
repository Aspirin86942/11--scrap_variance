export const SHEET_NAMES = {
  oa: "查询OA-存货报废申请单",
  erp: "查询ERP-报废明细表",
  panel: "查询面板",
  detailOutput: "报废差异明细",
  oaDocCompare: "OA视角单据对比",
  erpDocCompare: "ERP视角单据对比",
  precheckResult: "预验证结果",
  performanceDiagnostics: "性能诊断结果"
} as const;

// 这些字段名是 OA 源表读取契约，下游表头识别、预验证和正式查询都依赖同一份顺序。
export const OA_REQUIRED_HEADERS = [
  "表单编号",
  "金蝶云单据编号",
  "申请日期",
  "公司简称",
  "一级部门",
  "二级部门",
  "物料代码",
  "物料名称",
  "数量",
  "实际预算金额mx"
] as const;

// 这些字段名是 ERP 源表读取契约，分组窄读和 UsedRange 回退都会按它们解析源表。
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

// summary 只输出部门维度的聚合结果，不包含具体单据和物料明细。
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

// detail 是报废差异明细的完整字段契约，顺序必须和 DetailRow 转矩阵逻辑保持一致。
export const DETAIL_HEADERS = [
  "差异类型",
  "OA表单编号",
  "OA金蝶云单据编号",
  "OA申请日期",
  "ERP出库单号",
  "ERP源单单号",
  "ERP日期",
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

// OA/ERP 两个单据视角的表头相似但主单据不同，不能为了复用而混掉左右语义。
export const OA_DOC_COMPARE_HEADERS = [
  "行类型",
  "公司简称",
  "一级部门",
  "二级部门",
  "OA申请日期",
  "OA单据号",
  "OA数量",
  "OA金额",
  "ERP单据号",
  "ERP数量",
  "ERP金额",
  "数量差额",
  "金额差额",
  "物料编码",
  "物料名称",
  "备注"
] as const;

export const ERP_DOC_COMPARE_HEADERS = [
  "行类型",
  "公司简称",
  "一级部门",
  "二级部门",
  "ERP日期",
  "ERP单据号",
  "ERP数量",
  "ERP金额",
  "OA单据号",
  "OA数量",
  "OA金额",
  "数量差额",
  "金额差额",
  "物料编码",
  "物料名称",
  "备注"
] as const;

// 预验证输出给业务用户直接修数据，所以字段要包含定位、原因和处理建议。
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

// 诊断表里有些行不是 stage metric，用“不适用”区别于运行时拿不到的“无确切信息”。
export const DIAGNOSTICS_HEADERS = ["类别", "阶段", "输入行数", "输出行数", "耗时ms", "内存MB", "说明"] as const;

export const NOT_APPLICABLE = "不适用" as const;

// 差异类型有业务优先级，汇总摘要按这个顺序展示，避免同一组数据每次输出顺序漂移。
export const DIFFERENCE_TYPE_PRIORITY = [
  "OA有申请，ERP无出库",
  "ERP出库对应OA未在当前OA数据中找到",
  "OA和ERP都有，但物料明细不一致",
  "OA和ERP都有，但数量不同",
  "OA和ERP都有，数量一致"
] as const;

// 大范围清理使用固定上限，避免依赖 UsedRange 被历史格式污染后清不干净。
export const MAX_HEADER_SCAN_ROWS = 20;
export const MIN_OA_HEADER_MATCH_COUNT = 5;
export const MIN_ERP_HEADER_MATCH_COUNT = 5;
export const MAX_OUTPUT_CLEAR_ROW = 200000;
export const MAX_PRECHECK_CLEAR_ROW = 200000;
export const MAX_DIAGNOSTICS_CLEAR_ROW = 200000;
export const WRITE_CHUNK_ROWS = 1000;
