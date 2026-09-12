<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import * as echarts from "echarts";
import { useShiftStore } from "../store";
import { SHIFT_TYPES, STATUSES, STATUS_COLORS, totalIncome, type ShiftStatus } from "../types";

type MetricKey = "count" | "fuelSales" | "income";

const METRICS: Array<{ key: MetricKey; label: string; unit: string }> = [
  { key: "count", label: "记录数", unit: "条" },
  { key: "fuelSales", label: "油品销量", unit: "L" },
  { key: "income", label: "总收入", unit: "元" }
];

const metric = ref<MetricKey>("count");
const chartEl = ref<HTMLDivElement | null>(null);
let chart: echarts.ECharts | null = null;
let resizeObserver: ResizeObserver | null = null;

const store = useShiftStore();

const matrix = computed(() => {
  const rows: Record<ShiftStatus, number[]> = {
    待复核: [0, 0, 0],
    已复核: [0, 0, 0],
    有差异: [0, 0, 0]
  };
  for (const record of store.filteredRecords) {
    const shiftIndex = SHIFT_TYPES.indexOf(record.shift);
    if (shiftIndex < 0) continue;
    if (metric.value === "count") rows[record.status][shiftIndex] += 1;
    else if (metric.value === "fuelSales") rows[record.status][shiftIndex] += record.fuelSales;
    else rows[record.status][shiftIndex] += totalIncome(record);
  }
  return rows;
});

const activeMetric = computed(() => METRICS.find((m) => m.key === metric.value)!);

function render() {
  if (!chart) return;
  const rows = matrix.value;
  chart.setOption(
    {
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        valueFormatter: (value: number) =>
          metric.value === "count"
            ? `${value} 条`
            : metric.value === "fuelSales"
              ? `${Number(value).toLocaleString("zh-CN")} L`
              : `¥${Number(value).toLocaleString("zh-CN")}`
      },
      legend: {
        data: STATUSES,
        top: 0,
        icon: "roundRect",
        itemWidth: 12,
        itemHeight: 12,
        textStyle: { color: "#445069" }
      },
      grid: { left: 8, right: 12, top: 38, bottom: 6, containLabel: true },
      xAxis: {
        type: "category",
        data: SHIFT_TYPES,
        axisTick: { show: false },
        axisLine: { lineStyle: { color: "#cfd8e5" } },
        axisLabel: { color: "#536078", fontSize: 12 }
      },
      yAxis: {
        type: "value",
        minInterval: metric.value === "count" ? 1 : undefined,
        splitLine: { lineStyle: { color: "#eef2f7" } },
        axisLabel: { color: "#8a94a8", fontSize: 11 }
      },
      series: STATUSES.map((status) => ({
        name: status,
        type: "bar" as const,
        stack: "total",
        barMaxWidth: 46,
        itemStyle: { color: STATUS_COLORS[status], borderRadius: status === "有差异" ? [4, 4, 0, 0] : 0 },
        label: {
          show: true,
          color: "#fff",
          fontSize: 11,
          formatter: (params: { value: number }) =>
            metric.value === "count"
              ? String(params.value || "")
              : params.value >= 10000
                ? `${(params.value / 10000).toFixed(1)}万`
                : String(params.value || "")
        },
        data: rows[status]
      }))
    },
    { notMerge: true }
  );
}

onMounted(() => {
  if (!chartEl.value) return;
  chart = echarts.init(chartEl.value, undefined, { renderer: "svg" });
  render();
  resizeObserver = new ResizeObserver(() => chart?.resize());
  resizeObserver.observe(chartEl.value);
});

watch([matrix, metric], render);

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  chart?.dispose();
  chart = null;
});
</script>

<template>
  <section class="chart-panel">
    <div class="chart-head">
      <h2>班次 / 状态汇总</h2>
      <el-radio-group v-model="metric" size="small">
        <el-radio-button v-for="m in METRICS" :key="m.key" :value="m.key">
          {{ m.label }}
        </el-radio-button>
      </el-radio-group>
    </div>
    <p class="chart-sub" v-if="store.filteredRecords.length === 0">
      当前筛选条件下没有记录，图表为空。
    </p>
    <div ref="chartEl" class="chart-canvas" />
    <p class="chart-unit">单位：{{ activeMetric.unit }}（基于当前筛选结果 {{ store.filteredRecords.length }} 条）</p>
  </section>
</template>
