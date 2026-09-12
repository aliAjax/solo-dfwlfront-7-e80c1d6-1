import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { ElMessageBox, ElMessage } from "element-plus";
import {
  SHIFT_TYPES,
  STATUSES,
  STATUS_FLOW,
  totalIncome,
  type ShiftDraft,
  type ShiftRecord,
  type ShiftStatus,
  type ShiftType
} from "./types";
import { SEED_RECORDS } from "./seed";

const STORAGE_KEY = "gas-station-shift-handoff-v2";
const OLD_STORAGE_KEY = "dfwlfront-7-shift";

function loadRecords(): ShiftRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as ShiftRecord[];
      return Array.isArray(parsed) ? parsed : [];
    }
  } catch {
    // 数据损坏时回退到示例数据
  }
  // 清理旧版本 key
  localStorage.removeItem(OLD_STORAGE_KEY);
  return SEED_RECORDS.map((record, index) => ({
    ...record,
    id: `seed-${index + 1}`,
    createdAt: new Date(Date.now() - index * 86_400_000).toISOString()
  }));
}

function createId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export const useShiftStore = defineStore("shift", () => {
  const records = ref<ShiftRecord[]>(loadRecords());
  const shiftFilter = ref<ShiftType | "全部">("全部");
  const statusFilter = ref<ShiftStatus | "全部">("全部");
  const keyword = ref("");

  const filteredRecords = computed<ShiftRecord[]>(() => {
    const kw = keyword.value.trim().toLowerCase();
    return records.value.filter((record) => {
      if (shiftFilter.value !== "全部" && record.shift !== shiftFilter.value) return false;
      if (statusFilter.value !== "全部" && record.status !== statusFilter.value) return false;
      if (kw && !record.station.toLowerCase().includes(kw) && !record.notes.toLowerCase().includes(kw)) {
        return false;
      }
      return true;
    });
  });

  const summary = computed(() => {
    const list = filteredRecords.value;
    const fuelSales = list.reduce((sum, r) => sum + r.fuelSales, 0);
    const cash = list.reduce((sum, r) => sum + r.cash, 0);
    const digital = list.reduce((sum, r) => sum + r.digital, 0);
    return {
      count: list.length,
      fuelSales,
      cash,
      digital,
      income: cash + digital,
      pending: list.filter((r) => r.status === "待复核").length,
      reviewed: list.filter((r) => r.status === "已复核").length,
      disputed: list.filter((r) => r.status === "有差异").length
    };
  });

  function persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records.value));
  }

  function addRecord(draft: ShiftDraft): ShiftRecord {
    const record: ShiftRecord = {
      ...draft,
      id: createId(),
      status: "待复核",
      createdAt: new Date().toISOString()
    };
    records.value = [record, ...records.value];
    persist();
    ElMessage.success(`已新增 ${record.station} ${record.shift} 交接记录`);
    return record;
  }

  function availableTransitions(status: ShiftStatus): ShiftStatus[] {
    return STATUS_FLOW[status];
  }

  function transitionStatus(id: string, next: ShiftStatus) {
    const record = records.value.find((r) => r.id === id);
    if (!record) return;
    if (!STATUS_FLOW[record.status].includes(next)) return;
    record.status = next;
    persist();
    ElMessage.success(`${record.station}：${record.status}`);
  }

  async function removeRecord(id: string) {
    const record = records.value.find((r) => r.id === id);
    if (!record) return;
    try {
      await ElMessageBox.confirm(
        `确认移除「${record.station} ${record.shift}」的班次记录？移除后无法恢复。`,
        "移除确认",
        { type: "warning", confirmButtonText: "确认移除", cancelButtonText: "取消" }
      );
    } catch {
      return;
    }
    records.value = records.value.filter((r) => r.id !== id);
    persist();
    ElMessage.success("记录已移除");
  }

  function getById(id: string): ShiftRecord | undefined {
    return records.value.find((r) => r.id === id);
  }

  function resetFilters() {
    shiftFilter.value = "全部";
    statusFilter.value = "全部";
    keyword.value = "";
  }

  // 跨标签页同步
  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY && event.newValue) {
      try {
        records.value = JSON.parse(event.newValue) as ShiftRecord[];
      } catch {
        /* 忽略无法解析的变更 */
      }
    }
  });

  return {
    records,
    filteredRecords,
    summary,
    shiftFilter,
    statusFilter,
    keyword,
    SHIFT_TYPES: SHIFT_TYPES,
    STATUSES,
    addRecord,
    transitionStatus,
    availableTransitions,
    removeRecord,
    getById,
    resetFilters,
    totalIncome
  };
});

export { totalIncome };
