<script setup lang="ts">
import { reactive, ref } from "vue";
import type { FormInstance, FormRules } from "element-plus";
import { ElMessage } from "element-plus";
import { useShiftStore } from "../store";
import { draftLocation, clearDraftLocation } from "../map-state";
import { SHIFT_TYPES, type ShiftDraft, type ShiftRecord } from "../types";

const emit = defineEmits<{ (e: "created", record: ShiftRecord): void }>();

const store = useShiftStore();

interface ShiftFormModel {
  station: string;
  shift: ShiftDraft["shift"] | "";
  date: string;
  fuelSales: number | null;
  cash: number | null;
  digital: number | null;
  notes: string;
}

const formRef = ref<FormInstance>();
const submitting = ref(false);

function today(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

const form = reactive<ShiftFormModel>({
  station: "",
  shift: "",
  date: today(),
  fuelSales: null,
  cash: null,
  digital: null,
  notes: ""
});

/** 金额/销量统一校验：必填、数字、不能为负 */
const validateNonNegative = (_rule: unknown, value: number | null, callback: (err?: Error) => void) => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    callback(new Error("请输入数值"));
  } else if (value < 0) {
    callback(new Error("不能为负数"));
  } else if (!Number.isFinite(value)) {
    callback(new Error("数值无效"));
  } else {
    callback();
  }
};

const rules: FormRules<ShiftFormModel> = {
  station: [
    { required: true, message: "请输入加油站名称", trigger: "blur" },
    { min: 2, max: 30, message: "名称长度需在 2～30 个字之间", trigger: "blur" }
  ],
  shift: [{ required: true, message: "请选择班次", trigger: "change" }],
  date: [{ required: true, message: "请选择交接日期", trigger: "change" }],
  fuelSales: [{ required: true, validator: validateNonNegative, trigger: "blur" }],
  cash: [{ required: true, validator: validateNonNegative, trigger: "blur" }],
  digital: [{ required: true, validator: validateNonNegative, trigger: "blur" }],
  notes: [{ max: 200, message: "备注不能超过 200 字", trigger: "blur" }]
};

async function submit() {
  if (!formRef.value) return;
  try {
    await formRef.value.validate();
  } catch {
    ElMessage.warning("请检查表单中标红的输入项");
    return;
  }

  if (!draftLocation.value) {
    ElMessage.warning("请先在地图上点击选择加油站位置（待保存的红色标记处）");
    return;
  }

  submitting.value = true;
  const draft: ShiftDraft = {
    station: form.station.trim(),
    shift: form.shift as ShiftDraft["shift"],
    date: form.date,
    fuelSales: Number(form.fuelSales),
    cash: Number(form.cash),
    digital: Number(form.digital),
    notes: form.notes.trim() || "暂无备注",
    lng: Number(draftLocation.value.lng.toFixed(6)),
    lat: Number(draftLocation.value.lat.toFixed(6))
  };
  const record = store.addRecord(draft);
  clearDraftLocation();
  formRef.value.resetFields();
  Object.assign(form, {
    station: "",
    shift: "",
    date: today(),
    fuelSales: null,
    cash: null,
    digital: null,
    notes: ""
  });
  submitting.value = false;
  emit("created", record);
}
</script>

<template>
  <el-form
    ref="formRef"
    :model="form"
    :rules="rules"
    label-position="top"
    class="shift-form"
    @submit.prevent
  >
    <el-form-item label="加油站名称" prop="station">
      <el-input
        v-model="form.station"
        placeholder="例如：中石化朝阳加油站"
        clearable
        maxlength="30"
        show-word-limit
      />
    </el-form-item>

    <div class="form-row">
      <el-form-item label="班次" prop="shift">
        <el-select v-model="form.shift" placeholder="请选择班次" style="width: 100%">
          <el-option v-for="s in SHIFT_TYPES" :key="s" :label="s" :value="s" />
        </el-select>
      </el-form-item>

      <el-form-item label="交接日期" prop="date">
        <el-date-picker
          v-model="form.date"
          type="date"
          value-format="YYYY-MM-DD"
          placeholder="选择日期"
          style="width: 100%"
        />
      </el-form-item>
    </div>

    <div class="form-row">
      <el-form-item label="油品销量（L）" prop="fuelSales">
        <el-input-number
          v-model="form.fuelSales"
          :min="0"
          :precision="1"
          :step="100"
          controls-position="right"
          placeholder="0.0"
          style="width: 100%"
        />
      </el-form-item>
    </div>

    <div class="form-row">
      <el-form-item label="现金收入（元）" prop="cash">
        <el-input-number
          v-model="form.cash"
          :min="0"
          :precision="2"
          :step="100"
          controls-position="right"
          placeholder="0.00"
          style="width: 100%"
        />
      </el-form-item>

      <el-form-item label="电子支付（元）" prop="digital">
        <el-input-number
          v-model="form.digital"
          :min="0"
          :precision="2"
          :step="100"
          controls-position="right"
          placeholder="0.00"
          style="width: 100%"
        />
      </el-form-item>
    </div>

    <el-form-item label="地图位置">
      <div class="location-box" :class="{ active: draftLocation }">
        <template v-if="draftLocation">
          <span>经度 {{ draftLocation.lng.toFixed(5) }}，纬度 {{ draftLocation.lat.toFixed(5) }}</span>
          <el-button link type="primary" @click="clearDraftLocation">重新选择</el-button>
        </template>
        <span v-else class="location-hint">在地图上点击空白处选择位置</span>
      </div>
    </el-form-item>

    <el-form-item label="备注" prop="notes">
      <el-input
        v-model="form.notes"
        type="textarea"
        :rows="3"
        maxlength="200"
        show-word-limit
        placeholder="交接说明、差异情况等（不超过 200 字）"
      />
    </el-form-item>

    <el-button type="primary" class="submit-btn" :loading="submitting" @click="submit">
      保存交接记录
    </el-button>
  </el-form>
</template>
