import type { ShiftRecord } from "./types";
import { SEED_RECORDS } from "./seed";

export const STORAGE_KEY = "gas-station-shift-handoff-v2";
export const OLD_STORAGE_KEY = "dfwlfront-7-shift";

/** 首次访问时写入的示例记录（含 id/createdAt） */
export function buildSeedRecords(now: number = Date.now()): ShiftRecord[] {
  return SEED_RECORDS.map((record, index) => ({
    ...record,
    id: `seed-${index + 1}`,
    createdAt: new Date(now - index * 86_400_000).toISOString()
  }));
}

/**
 * 从 localStorage 读取记录：
 * - 无数据时生成示例数据并立即持久化；
 * - 数据损坏（无法解析或非数组）时回退示例数据；
 * - localStorage 不可用时只在内存中返回。
 */
export function loadRecords(): ShiftRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      // 与既有行为一致：合法 JSON 但非数组时返回空列表
      return Array.isArray(parsed) ? (parsed as ShiftRecord[]) : [];
    }
  } catch {
    // JSON 损坏时回退到示例数据
  }
  // 首次访问（或数据损坏）：生成示例数据并立即持久化，同时清理旧版本 key
  localStorage.removeItem(OLD_STORAGE_KEY);
  const seeds = buildSeedRecords();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seeds));
  } catch {
    /* 存储不可用时仅内存使用 */
  }
  return seeds;
}

export function persistRecords(records: ShiftRecord[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}
