import type { ShiftRecord, ShiftStatus, ShiftType } from "../src/types";

let seq = 0;

interface PartialRecord {
  station?: string;
  shift?: ShiftType;
  date?: string;
  fuelSales?: number;
  cash?: number;
  digital?: number;
  status?: ShiftStatus;
  notes?: string;
  lng?: number;
  lat?: number;
}

export function makeRecord(overrides: PartialRecord = {}): ShiftRecord {
  seq += 1;
  return {
    id: `t${seq}`,
    station: overrides.station ?? `测试站${seq}`,
    shift: overrides.shift ?? "早班",
    date: overrides.date ?? "2026-09-12",
    fuelSales: overrides.fuelSales ?? 0,
    cash: overrides.cash ?? 0,
    digital: overrides.digital ?? 0,
    status: overrides.status ?? "待复核",
    notes: overrides.notes ?? "暂无备注",
    lng: overrides.lng ?? 116.4 + seq * 0.01,
    lat: overrides.lat ?? 39.9 + seq * 0.01,
    createdAt: new Date(Date.now() + seq).toISOString()
  };
}

/** 直接构造一份已持久化的数据（模拟"刷新页面"前的 localStorage 内容） */
export function seedStorage(records: ShiftRecord[], key = "gas-station-shift-handoff-v2") {
  localStorage.setItem(key, JSON.stringify(records));
}
