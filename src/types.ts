/** 班次交接记录数据模型与常量 */

export type ShiftType = "早班" | "中班" | "晚班";
export type ShiftStatus = "待复核" | "已复核" | "有差异";

export interface LatLng {
  lng: number;
  lat: number;
}

export interface ShiftRecord {
  id: string;
  /** 加油站名称 */
  station: string;
  /** 班次 */
  shift: ShiftType;
  /** 交接日期 YYYY-MM-DD */
  date: string;
  /** 油品销量（升） */
  fuelSales: number;
  /** 现金收入（元） */
  cash: number;
  /** 电子支付（元） */
  digital: number;
  status: ShiftStatus;
  /** 备注 */
  notes: string;
  lng: number;
  lat: number;
  createdAt: string;
}

/** 新增表单提交的数据（状态由系统赋默认值） */
export type ShiftDraft = Omit<ShiftRecord, "id" | "createdAt" | "status">;

export const SHIFT_TYPES: ShiftType[] = ["早班", "中班", "晚班"];
export const STATUSES: ShiftStatus[] = ["待复核", "已复核", "有差异"];

/**
 * 状态流转规则：
 * 待复核 → 已复核 / 标记有差异
 * 有差异 → 重新核对（回待复核）/ 复核通过
 * 已复核 → 撤回复核（允许纠错）
 */
export const STATUS_FLOW: Record<ShiftStatus, ShiftStatus[]> = {
  待复核: ["已复核", "有差异"],
  有差异: ["待复核", "已复核"],
  已复核: ["待复核"]
};

export const STATUS_COLORS: Record<ShiftStatus, string> = {
  待复核: "#e6a23c",
  已复核: "#67c23a",
  有差异: "#f56c6c"
};

export const STATUS_NEXT_LABEL: Record<ShiftStatus, Partial<Record<ShiftStatus, string>>> = {
  待复核: { 已复核: "复核通过", 有差异: "标记差异" },
  有差异: { 待复核: "重新核对", 已复核: "复核通过" },
  已复核: { 待复核: "撤回复核" }
};

export function totalIncome(record: Pick<ShiftRecord, "cash" | "digital">): number {
  return record.cash + record.digital;
}

export function formatMoney(value: number): string {
  return `¥${value.toLocaleString("zh-CN", { maximumFractionDigits: 2 })}`;
}
