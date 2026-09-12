import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

// element-plus 的消息组件依赖 DOM 挂载与动画，单测中静默处理
vi.mock("element-plus", async () => {
  const actual = await vi.importActual<typeof import("element-plus")>("element-plus");
  return {
    ...actual,
    ElMessage: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
    ElMessageBox: { confirm: vi.fn() }
  };
});

import { useShiftStore } from "../src/store";
import { STORAGE_KEY } from "../src/storage";
import { makeRecord, seedStorage } from "./helpers";

beforeEach(() => {
  setActivePinia(createPinia());
});

function seed(records: ReturnType<typeof makeRecord>[]) {
  seedStorage(records, STORAGE_KEY);
}

describe("汇总计算", () => {
  it("按当前筛选结果汇总数量、状态分布、销量与收入", () => {
    seed([
      makeRecord({ shift: "早班", status: "已复核", fuelSales: 1000, cash: 100, digital: 400 }),
      makeRecord({ shift: "早班", status: "待复核", fuelSales: 2000, cash: 200, digital: 800 }),
      makeRecord({ shift: "晚班", status: "有差异", fuelSales: 500, cash: 50, digital: 150 })
    ]);
    const store = useShiftStore();

    expect(store.summary.count).toBe(3);
    expect(store.summary.fuelSales).toBe(3500);
    expect(store.summary.cash).toBe(350);
    expect(store.summary.digital).toBe(1350);
    expect(store.summary.income).toBe(1700);
    expect(store.summary.reviewed).toBe(1);
    expect(store.summary.pending).toBe(1);
    expect(store.summary.disputed).toBe(1);
  });

  it("空数据汇总全部为 0，不抛错", () => {
    seed([]);
    const store = useShiftStore();
    expect(store.summary).toMatchObject({
      count: 0,
      fuelSales: 0,
      cash: 0,
      digital: 0,
      income: 0,
      pending: 0,
      reviewed: 0,
      disputed: 0
    });
  });

  it("大量数值不产生浮点误差（整数收入）", () => {
    seed([makeRecord({ cash: 100000, digital: 200000 })]);
    const store = useShiftStore();
    expect(store.summary.income).toBe(300000);
  });
});

describe("筛选汇总联动", () => {
  beforeEach(() => {
    seed([
      makeRecord({ station: "朝阳站", shift: "早班", status: "已复核", notes: "正常" }),
      makeRecord({ station: "海淀站", shift: "中班", status: "待复核", notes: "等待确认" }),
      makeRecord({ station: "丰台站", shift: "晚班", status: "有差异", notes: "油枪差异" }),
      makeRecord({ station: "通州站", shift: "早班", status: "待复核", notes: "正常" })
    ]);
  });

  it("按班次筛选", () => {
    const store = useShiftStore();
    store.shiftFilter = "早班";
    expect(store.filteredRecords.map((r) => r.station)).toEqual(["朝阳站", "通州站"]);
    expect(store.summary.count).toBe(2);
  });

  it("按状态筛选", () => {
    const store = useShiftStore();
    store.statusFilter = "待复核";
    expect(store.filteredRecords.map((r) => r.station)).toEqual(["海淀站", "通州站"]);
  });

  it("班次与状态组合筛选", () => {
    const store = useShiftStore();
    store.shiftFilter = "早班";
    store.statusFilter = "已复核";
    expect(store.filteredRecords.map((r) => r.station)).toEqual(["朝阳站"]);
  });

  it("关键词同时匹配站名和备注，且忽略大小写空格", () => {
    const store = useShiftStore();
    store.keyword = "朝阳";
    expect(store.filteredRecords.length).toBe(1);
    store.keyword = "差异";
    expect(store.filteredRecords.map((r) => r.station)).toEqual(["丰台站"]);
    store.keyword = "  ";
    expect(store.filteredRecords.length).toBe(4);
  });

  it("resetFilters 恢复全部", () => {
    const store = useShiftStore();
    store.shiftFilter = "晚班";
    store.statusFilter = "有差异";
    store.keyword = "zzz";
    store.resetFilters();
    expect(store.shiftFilter).toBe("全部");
    expect(store.statusFilter).toBe("全部");
    expect(store.keyword).toBe("");
    expect(store.filteredRecords.length).toBe(4);
  });
});
