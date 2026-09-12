import { ref } from "vue";

/**
 * 地图上点击但尚未随表单保存的“草稿位置”。
 * 地图组件负责写入，新增表单负责读取/清除。
 */
export const draftLocation = ref<{ lng: number; lat: number } | null>(null);

export function clearDraftLocation() {
  draftLocation.value = null;
}
