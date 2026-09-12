<script setup lang="ts">
import { ref } from "vue";
import ShiftForm from "./components/ShiftForm.vue";
import MapView from "./components/MapView.vue";
import SummaryChart from "./components/SummaryChart.vue";
import ShiftList from "./components/ShiftList.vue";
import { useShiftStore } from "./store";
import { SHIFT_TYPES, STATUSES, formatMoney, type ShiftRecord } from "./types";

const store = useShiftStore();
const mapRef = ref<InstanceType<typeof MapView> | null>(null);

function locate(record: ShiftRecord) {
  mapRef.value?.flyToRecord(record);
  const el = document.querySelector(".map-panel");
  el?.scrollIntoView({ behavior: "smooth", block: "start" });
}

const statusCountOptions = [{ label: "全部状态", value: "全部" as const }, ...STATUSES.map((s) => ({ label: s, value: s }))];
const shiftOptions = [{ label: "全部班次", value: "全部" as const }, ...SHIFT_TYPES.map((s) => ({ label: s, value: s }))];
</script>

<template>
  <div class="page">
    <header class="page-header">
      <div class="header-text">
        <p class="eyebrow">石油 · 加油站运营</p>
        <h1>加油站班次交接地图</h1>
        <p class="subtitle">在地图上查看各班次交接数据，按班次与状态汇总销量与收入。数据保存在本浏览器中。</p>
      </div>
      <div class="header-badges">
        <span class="badge">Vue 3</span>
        <span class="badge">Leaflet</span>
        <span class="badge">ECharts</span>
        <span class="badge">Element Plus</span>
      </div>
    </header>

    <section class="stat-row">
      <article class="stat-card">
        <span>当前班次</span>
        <strong>{{ store.summary.count }}</strong>
        <em>条记录</em>
      </article>
      <article class="stat-card stat-card--pending">
        <span>待复核 / 有差异</span>
        <strong>{{ store.summary.pending }} / {{ store.summary.disputed }}</strong>
        <em>已复核 {{ store.summary.reviewed }}</em>
      </article>
      <article class="stat-card">
        <span>油品销量</span>
        <strong>{{ store.summary.fuelSales.toLocaleString("zh-CN") }}</strong>
        <em>升（L）</em>
      </article>
      <article class="stat-card stat-card--money">
        <span>当班总收入</span>
        <strong>{{ formatMoney(store.summary.income) }}</strong>
        <em>现金 {{ formatMoney(store.summary.cash) }} · 电子 {{ formatMoney(store.summary.digital) }}</em>
      </article>
    </section>

    <section class="map-chart">
      <div class="panel map-panel">
        <div class="panel-head">
          <h2>班次地图</h2>
        </div>
        <MapView ref="mapRef" />
      </div>
      <div class="panel chart-side">
        <SummaryChart />
      </div>
    </section>

    <section class="form-list">
      <div class="panel form-panel">
        <div class="panel-head">
          <h2>新增班次交接</h2>
        </div>
        <ShiftForm />
      </div>

      <div class="panel list-side">
        <div class="filters">
          <el-select v-model="store.shiftFilter" placeholder="班次" style="width: 118px" size="default">
            <el-option v-for="opt in shiftOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
          </el-select>
          <el-select v-model="store.statusFilter" placeholder="状态" style="width: 118px" size="default">
            <el-option v-for="opt in statusCountOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
          </el-select>
          <el-input
            v-model="store.keyword"
            placeholder="搜索加油站名称或备注"
            clearable
            class="keyword-input"
          >
            <template #prefix>🔍</template>
          </el-input>
        </div>
        <ShiftList @locate="locate" />
      </div>
    </section>

    <footer class="page-footer">
      数据存储于浏览器 localStorage（键：gas-station-shift-handoff-v2），清除浏览器数据会删除记录。
    </footer>
  </div>
</template>
