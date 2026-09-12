import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

const { confirmMock } = vi.hoisted(() => ({ confirmMock: vi.fn() }));

vi.mock("element-plus", async () => {
  const actual = await vi.importActual<typeof import("element-plus")>("element-plus");
  return {
    ...actual,
    ElMessage: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
    ElMessageBox: { confirm: confirmMock }
  };
});

import { useShiftStore } from "../src/store";
import { STORAGE_KEY, OLD_STORAGE_KEY, loadRecords, buildSeedRecords } from "../src/storage";
import { makeRecord, seedStorage } from "./helpers";
import type { ShiftDraft } from "../src/types";

beforeEach(() => {
  setActivePinia(createPinia());
  confirmMock.mockReset();
});

function draft(overrides: Partial<ShiftDraft> = {}): ShiftDraft {
  return {
    station: "新建站",
    shift: "中班",
    date: "2026-09-12",
    fuelSales: 1000,
    cash: 500,
    digital: 2500,
    notes: "新备注",
    lng: 116.5,
    lat: 39.95,
    ...overrides
  };
}

describe("storage 读写边界", () => {
  it("首次访问（无数据）写入 5 条示例并持久化", () => {
    const records = loadRecords();
    expect(records).toHaveLength(5);
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(stored).toHaveLength(5);
    expect(stored[0].id).toBe("seed-1");
  });

  it("有合法数据时原样读回，不覆盖", () => {
    const existing = [makeRecord({ station: "我的站" })];
    seedStorage(existing, STORAGE_KEY);
    const records = loadRecords();
    expect(records).toHaveLength(1);
    expect(records[0].station).toBe("我的站");
    // localStorage 仍是原有 1 条，没有被种子覆盖
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toHaveLength(1);
  });

  it("存储空数组时返回空数组（不重新播种）", () => {
    seedStorage([], STORAGE_KEY);
    expect(loadRecords()).toEqual([]);
  });

  it("JSON 损坏时回退示例数据", () => {
    localStorage.setItem(STORAGE_KEY, "{not valid json");
    expect(loadRecords()).toHaveLength(5);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toHaveLength(5);
  });

  it("合法 JSON 但非数组时返回空数组（与既有行为一致）", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ station: "x" }));
    expect(loadRecords()).toEqual([]);
  });

  it("首次访问会清理旧版本 key", () => {
    localStorage.setItem(OLD_STORAGE_KEY, "old");
    loadRecords();
    expect(localStorage.getItem(OLD_STORAGE_KEY)).toBeNull();
  });

  it("buildSeedRecords 的 createdAt 按天递减且可注入时间", () => {
    const now = new Date("2026-09-12T08:00:00Z").getTime();
    const seeds = buildSeedRecords(now);
    expect(new Date(seeds[0].createdAt).getTime()).toBe(now);
    expect(new Date(seeds[1].createdAt).getTime()).toBe(now - 86_400_000);
  });
});

describe("store 持久化", () => {
  it("新增记录立即写入 localStorage，且新记录置于列表头部、默认待复核", () => {
    seedStorage([makeRecord()], STORAGE_KEY);
    const store = useShiftStore();
    const created = store.addRecord(draft());

    expect(created.id).toBeTruthy();
    expect(created.status).toBe("待复核");
    expect(store.records[0].id).toBe(created.id);

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!) as Array<{ id: string }>;
    expect(stored).toHaveLength(2);
    expect(stored[0].id).toBe(created.id);
  });

  it("合法流转立即持久化新状态", () => {
    seedStorage([makeRecord({ status: "待复核" })], STORAGE_KEY);
    const store = useShiftStore();
    const id = store.records[0].id;

    store.transitionStatus(id, "已复核");
    expect(store.records[0].status).toBe("已复核");
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)[0].status).toBe("已复核");
  });

  it("非法流转被忽略，不写存储", () => {
    const r = makeRecord({ status: "已复核" });
    seedStorage([r], STORAGE_KEY);
    const store = useShiftStore();
    localStorage.clear(); // 之后若有写入会读到 null
    store.transitionStatus(r.id, "有差异"); // 已复核只能回待复核
    expect(store.records[0].status).toBe("已复核");
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("不存在的 id 流转安全忽略", () => {
    seedStorage([makeRecord()], STORAGE_KEY);
    const store = useShiftStore();
    expect(() => store.transitionStatus("missing", "已复核")).not.toThrow();
  });

  it("确认移除后从列表和存储中删除", async () => {
    const r = makeRecord();
    seedStorage([r, makeRecord()], STORAGE_KEY);
    const store = useShiftStore();
    confirmMock.mockResolvedValue(undefined);

    await store.removeRecord(r.id);
    expect(store.records).toHaveLength(1);
    expect(store.getById(r.id)).toBeUndefined();
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(stored).toHaveLength(1);
    expect(stored[0].id).not.toBe(r.id);
  });

  it("取消移除时数据不变且不写存储", async () => {
    const r = makeRecord();
    seedStorage([r], STORAGE_KEY);
    const before = localStorage.getItem(STORAGE_KEY);
    const store = useShiftStore();
    confirmMock.mockRejectedValue(new Error("cancel"));

    await store.removeRecord(r.id);
    expect(store.records).toHaveLength(1);
    expect(localStorage.getItem(STORAGE_KEY)).toBe(before);
  });
});
