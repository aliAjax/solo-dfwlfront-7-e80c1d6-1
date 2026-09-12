import type { ShiftRecord } from "./types";

/** 首次访问时写入本地的示例数据（北京周边加油站） */
export const SEED_RECORDS: Array<Omit<ShiftRecord, "id" | "createdAt">> = [
  {
    station: "中石化朝阳加油站",
    shift: "早班",
    date: "2026-09-12",
    fuelSales: 4280,
    cash: 8300,
    digital: 21000,
    status: "已复核",
    notes: "账实一致，油枪读数正常。",
    lng: 116.4551,
    lat: 39.9205
  },
  {
    station: "中石油海淀加油站",
    shift: "中班",
    date: "2026-09-12",
    fuelSales: 3910,
    cash: 6400,
    digital: 19800,
    status: "待复核",
    notes: "等待站长确认后复核。",
    lng: 116.3104,
    lat: 39.9836
  },
  {
    station: "中石化丰台南站",
    shift: "晚班",
    date: "2026-09-11",
    fuelSales: 5120,
    cash: 9100,
    digital: 24600,
    status: "有差异",
    notes: "92# 油枪读数与销量差 35L，已上报。",
    lng: 116.2866,
    lat: 39.8584
  },
  {
    station: "中石油通州北苑站",
    shift: "早班",
    date: "2026-09-11",
    fuelSales: 3650,
    cash: 7200,
    digital: 17500,
    status: "已复核",
    notes: "电子支付凭证齐全。",
    lng: 116.6566,
    lat: 39.9095
  },
  {
    station: "中石化石景山站",
    shift: "晚班",
    date: "2026-09-10",
    fuelSales: 2890,
    cash: 5300,
    digital: 14200,
    status: "待复核",
    notes: "夜间客流较少，无异常。",
    lng: 116.2222,
    lat: 39.9056
  }
];
