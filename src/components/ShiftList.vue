<script setup lang="ts">
import { computed } from "vue";
import {
  STATUS_COLORS,
  STATUS_NEXT_LABEL,
  formatMoney,
  totalIncome,
  type ShiftRecord,
  type ShiftStatus
} from "../types";
import { useShiftStore } from "../store";

const emit = defineEmits<{ (e: "locate", record: ShiftRecord): void }>();

const store = useShiftStore();

function tagStyle(status: ShiftStatus) {
  return {
    color: STATUS_COLORS[status],
    borderColor: STATUS_COLORS[status],
    background: `${STATUS_COLORS[status]}14`
  };
}

function flowOptions(record: ShiftRecord) {
  return store.availableTransitions(record.status).map((next) => ({
    next,
    label: STATUS_NEXT_LABEL[record.status][next] ?? `流转到${next}`
  }));
}

const hasFilter = computed(
  () => store.shiftFilter !== "全部" || store.statusFilter !== "全部" || store.keyword.trim() !== ""
);
</script>

<template>
  <section class="list-panel">
    <div class="list-head">
      <h2>班次记录</h2>
      <el-button v-if="hasFilter" link type="primary" size="small" @click="store.resetFilters()">
        清除筛选
      </el-button>
    </div>

    <el-empty v-if="store.filteredRecords.length === 0" description="没有符合筛选条件的班次" :image-size="72" />

    <!-- 桌面：表格 -->
    <el-table v-else :data="store.filteredRecords" class="record-table" stripe>
      <el-table-column label="加油站 / 日期" min-width="170">
        <template #default="{ row }: { row: ShiftRecord }">
          <strong>{{ row.station }}</strong>
          <span class="cell-sub">{{ row.date }} · {{ row.shift }}</span>
        </template>
      </el-table-column>
      <el-table-column label="油品销量(L)" prop="fuelSales" min-width="110" align="right" sortable>
        <template #default="{ row }: { row: ShiftRecord }">
          {{ row.fuelSales.toLocaleString("zh-CN") }}
        </template>
      </el-table-column>
      <el-table-column label="现金" min-width="100" align="right">
        <template #default="{ row }: { row: ShiftRecord }">{{ formatMoney(row.cash) }}</template>
      </el-table-column>
      <el-table-column label="电子支付" min-width="100" align="right">
        <template #default="{ row }: { row: ShiftRecord }">{{ formatMoney(row.digital) }}</template>
      </el-table-column>
      <el-table-column label="总收入" min-width="110" align="right">
        <template #default="{ row }: { row: ShiftRecord }">
          <strong>{{ formatMoney(totalIncome(row)) }}</strong>
        </template>
      </el-table-column>
      <el-table-column label="状态" min-width="92" align="center">
        <template #default="{ row }: { row: ShiftRecord }">
          <span class="status-tag" :style="tagStyle(row.status)">{{ row.status }}</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" min-width="210">
        <template #default="{ row }: { row: ShiftRecord }">
          <div class="row-actions">
            <el-button
              v-for="opt in flowOptions(row)"
              :key="opt.next"
              size="small"
              :type="opt.next === '有差异' ? 'danger' : opt.next === '已复核' ? 'success' : 'warning'"
              plain
              @click="store.transitionStatus(row.id, opt.next)"
            >
              {{ opt.label }}
            </el-button>
            <el-button size="small" @click="emit('locate', row)">定位</el-button>
            <el-button size="small" type="danger" link @click="store.removeRecord(row.id)">移除</el-button>
          </div>
        </template>
      </el-table-column>
    </el-table>

    <!-- 手机：卡片 -->
    <div v-if="store.filteredRecords.length > 0" class="record-cards">
      <article v-for="row in store.filteredRecords" :key="row.id" class="record-card">
        <div class="card-head">
          <strong>{{ row.station }}</strong>
          <span class="status-tag" :style="tagStyle(row.status)">{{ row.status }}</span>
        </div>
        <p class="card-meta">{{ row.date }} · {{ row.shift }}</p>
        <dl class="card-grid">
          <div><dt>油品销量</dt><dd>{{ row.fuelSales.toLocaleString("zh-CN") }} L</dd></div>
          <div><dt>现金收入</dt><dd>{{ formatMoney(row.cash) }}</dd></div>
          <div><dt>电子支付</dt><dd>{{ formatMoney(row.digital) }}</dd></div>
          <div><dt>总收入</dt><dd>{{ formatMoney(totalIncome(row)) }}</dd></div>
        </dl>
        <p v-if="row.notes" class="card-notes">{{ row.notes }}</p>
        <div class="card-actions">
          <el-button
            v-for="opt in flowOptions(row)"
            :key="opt.next"
            size="small"
            :type="opt.next === '有差异' ? 'danger' : opt.next === '已复核' ? 'success' : 'warning'"
            plain
            @click="store.transitionStatus(row.id, opt.next)"
          >
            {{ opt.label }}
          </el-button>
          <el-button size="small" @click="emit('locate', row)">定位</el-button>
          <el-button size="small" type="danger" link @click="store.removeRecord(row.id)">移除</el-button>
        </div>
      </article>
    </div>
  </section>
</template>
