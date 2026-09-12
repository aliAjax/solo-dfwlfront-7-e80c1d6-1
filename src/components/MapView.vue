<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useShiftStore } from "../store";
import {
  STATUS_COLORS,
  STATUS_NEXT_LABEL,
  STATUSES,
  formatMoney,
  totalIncome,
  type ShiftRecord,
  type ShiftStatus
} from "../types";
import { clearDraftLocation, draftLocation } from "../map-state";

const BEIJING: [number, number] = [39.9042, 116.4274];

const containerEl = ref<HTMLDivElement | null>(null);

let map: L.Map | null = null;
let recordLayer: L.LayerGroup | null = null;
let draftMarker: L.Marker | null = null;
let didInitialFit = false;
let openPopupId: string | null = null;
const markerById = new Map<string, L.Marker & { shiftId?: string; shiftStatus?: ShiftStatus }>();

const store = useShiftStore();

function markerIcon(status: ShiftStatus): L.DivIcon {
  const color = STATUS_COLORS[status];
  return L.divIcon({
    className: "shift-marker",
    html: `<span class="shift-pin" style="--pin-color:${color}" title="${status}"></span>`,
    iconSize: [26, 34],
    iconAnchor: [13, 34],
    popupAnchor: [0, -32]
  });
}

function draftIcon(): L.DivIcon {
  return L.divIcon({
    className: "shift-marker",
    html: `<span class="shift-pin shift-pin--draft" title="待保存的新位置"></span>`,
    iconSize: [26, 34],
    iconAnchor: [13, 34],
    popupAnchor: [0, -32]
  });
}

function statusBadge(status: ShiftStatus): string {
  return `<span class="pop-status" style="background:${STATUS_COLORS[status]}">${status}</span>`;
}

function escapeHtml(text: string): string {
  // 纯字符串替换，不依赖 DOM；同时覆盖引号，文本节点与属性值均可安全使用
  return String(text).replace(/[&<>"']/g, (ch) => ESCAPE_MAP[ch]);
}

const ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
};

function popupHtml(record: ShiftRecord): string {
  const transitions = store.availableTransitions(record.status);
  const id = escapeHtml(record.id);
  const buttons = transitions
    .map(
      (next) =>
        `<button type="button" class="pop-btn" data-action="flow" data-id="${id}" data-next="${escapeHtml(next)}">` +
        `${escapeHtml(STATUS_NEXT_LABEL[record.status][next] ?? `流转到${next}`)}</button>`
    )
    .join("");
  return `
    <div class="pop-card" data-id="${id}">
      <div class="pop-head">
        <strong>${escapeHtml(record.station)}</strong>
        ${statusBadge(record.status)}
      </div>
      <div class="pop-meta">${escapeHtml(record.date)} · ${escapeHtml(record.shift)}</div>
      <dl class="pop-grid">
        <div><dt>油品销量</dt><dd>${record.fuelSales.toLocaleString("zh-CN")} L</dd></div>
        <div><dt>现金收入</dt><dd>${escapeHtml(formatMoney(record.cash))}</dd></div>
        <div><dt>电子支付</dt><dd>${escapeHtml(formatMoney(record.digital))}</dd></div>
        <div><dt>当班总收入</dt><dd>${escapeHtml(formatMoney(totalIncome(record)))}</dd></div>
      </dl>
      <p class="pop-notes">${escapeHtml(record.notes)}</p>
      <div class="pop-actions">
        ${buttons}
        <button type="button" class="pop-btn pop-btn--danger" data-action="remove" data-id="${id}">移除</button>
      </div>
    </div>`;
}

/** 增量同步标记：已有的只更新图标/位置/弹窗内容，避免整层重建导致弹窗闪烁关闭 */
function syncMarkers() {
  if (!map || !recordLayer) return;
  const list = store.filteredRecords;
  const alive = new Set<string>();

  for (const record of list) {
    alive.add(record.id);
    let marker = markerById.get(record.id);
    if (!marker) {
      marker = L.marker([record.lat, record.lng], {
        icon: markerIcon(record.status),
        title: `${record.station}（${record.status}）`
      }) as L.Marker & { shiftId?: string; shiftStatus?: ShiftStatus };
      marker.shiftId = record.id;
      marker.shiftStatus = record.status;
      marker.bindPopup(popupHtml(record), { closeButton: true, maxWidth: 320, minWidth: 260 });
      marker.on("popupopen", () => {
        openPopupId = record.id;
      });
      recordLayer.addLayer(marker);
      markerById.set(record.id, marker);
    } else {
      if (marker.shiftStatus !== record.status) {
        marker.setIcon(markerIcon(record.status));
        marker.shiftStatus = record.status;
      }
      marker.setLatLng([record.lat, record.lng]);
      // setPopupContent 会在弹窗打开时就地刷新内容，不会关闭弹窗
      marker.setPopupContent(popupHtml(record));
    }
  }

  for (const [id, marker] of [...markerById]) {
    if (!alive.has(id)) {
      recordLayer.removeLayer(marker);
      markerById.delete(id);
    }
  }

  if (!didInitialFit && list.length > 0) {
    const bounds = L.latLngBounds(list.map((r) => [r.lat, r.lng] as [number, number]));
    map.fitBounds(bounds.pad(0.25), { maxZoom: 12 });
    didInitialFit = true;
  }
}

function handlePopupClick(event: Event) {
  const target = (event.target as HTMLElement).closest<HTMLElement>("[data-action]");
  if (!target) return;
  const id = target.dataset.id;
  if (!id) return;
  if (target.dataset.action === "flow" && target.dataset.next) {
    store.transitionStatus(id, target.dataset.next as ShiftStatus);
  } else if (target.dataset.action === "remove") {
    openPopupId = null;
    void store.removeRecord(id);
  }
}

function onMapClick(event: L.LeafletMouseEvent) {
  if (!map) return;
  const { lng, lat } = event.latlng.wrap();
  draftLocation.value = {
    lng: Number(lng.toFixed(6)),
    lat: Number(lat.toFixed(6))
  };
}

function renderDraftMarker() {
  if (!map) return;
  if (draftMarker) {
    map.removeLayer(draftMarker);
    draftMarker = null;
  }
  if (draftLocation.value) {
    draftMarker = L.marker([draftLocation.value.lat, draftLocation.value.lng], {
      icon: draftIcon(),
      zIndexOffset: 1000
    }).addTo(map);
  }
}

function flyToRecord(record: ShiftRecord) {
  if (!map) return;
  map.flyTo([record.lat, record.lng], 14, { duration: 0.6 });
  setTimeout(() => {
    openPopupId = record.id;
    markerById.get(record.id)?.openPopup();
  }, 650);
}

defineExpose({ flyToRecord });

onMounted(() => {
  if (!containerEl.value) return;
  map = L.map(containerEl.value, {
    center: BEIJING,
    zoom: 10,
    zoomControl: true,
    attributionControl: true
  });

  // 高德地图瓦片（GCJ-02 坐标，国内访问稳定；示例坐标同样为 GCJ-02 近似坐标）
  L.tileLayer(
    "https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}",
    {
      subdomains: ["1", "2", "3", "4"],
      maxZoom: 19,
      attribution: "&copy; 高德地图"
    }
  ).addTo(map);

  recordLayer = L.layerGroup().addTo(map);

  map.on("click", onMapClick);
  map.on("popupopen", (event: L.PopupEvent) => {
    const el = event.popup.getElement();
    if (!el || el.dataset.clickBound === "1") return;
    el.dataset.clickBound = "1";
    // 部分环境（触摸/无头浏览器）下 Leaflet 自身的屏蔽可能失效，
    // 显式阻止 click/mousedown 冒泡到地图，避免点按钮时弹窗被 preclick 关闭
    const stop = (domEvent: Event) => domEvent.stopPropagation();
    el.addEventListener("click", stop);
    el.addEventListener("mousedown", stop);
    el.addEventListener("touchstart", stop);
    el.addEventListener("click", handlePopupClick);
  });
  map.on("popupclose", () => {
    openPopupId = null;
  });

  syncMarkers();
  renderDraftMarker();

  // 移动端 Leaflet 偶尔需要手动修正尺寸
  setTimeout(() => map?.invalidateSize(), 200);
});

watch(
  () => store.filteredRecords,
  () => syncMarkers(),
  { deep: true }
);
watch(draftLocation, renderDraftMarker);

onBeforeUnmount(() => {
  clearDraftLocation();
  markerById.clear();
  map?.remove();
  map = null;
});
</script>

<template>
  <div class="map-wrap">
    <div ref="containerEl" class="map-container" />
    <div class="map-legend">
      <span v-for="status in STATUSES" :key="status" class="legend-item">
        <i class="legend-dot" :style="{ background: STATUS_COLORS[status] }" />{{ status }}
      </span>
      <span class="legend-item">
        <i class="legend-dot legend-dot--draft" />待保存
      </span>
    </div>
    <p class="map-tip">点击地图空白处可为新班次选择位置</p>
  </div>
</template>
