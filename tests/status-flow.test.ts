import { describe, expect, it } from "vitest";
import {
  SHIFT_TYPES,
  STATUSES,
  STATUS_FLOW,
  STATUS_NEXT_LABEL,
  totalIncome,
  formatMoney
} from "../src/types";

describe("状态流转规则", () => {
  it("待复核可复核通过或标记差异", () => {
    expect(STATUS_FLOW["待复核"]).toEqual(["已复核", "有差异"]);
  });

  it("有差异可重新核对或复核通过", () => {
    expect(STATUS_FLOW["有差异"]).toEqual(["待复核", "已复核"]);
  });

  it("已复核可撤回复核用于纠错", () => {
    expect(STATUS_FLOW["已复核"]).toEqual(["待复核"]);
  });

  it("每个状态的每个去向都配置了按钮文案", () => {
    for (const status of STATUSES) {
      for (const next of STATUS_FLOW[status]) {
        expect(STATUS_NEXT_LABEL[status][next]).toBeTruthy();
      }
    }
  });

  it("状态机连通：每个状态至少有一个去向，共三种状态", () => {
    expect(STATUSES).toEqual(["待复核", "已复核", "有差异"]);
    for (const status of STATUSES) {
      expect(STATUS_FLOW[status].length).toBeGreaterThan(0);
      for (const next of STATUS_FLOW[status]) expect(STATUSES).toContain(next);
    }
  });

  it("班次固定为早/中/晚班", () => {
    expect(SHIFT_TYPES).toEqual(["早班", "中班", "晚班"]);
  });
});

describe("金额计算", () => {
  it("总收入 = 现金 + 电子支付", () => {
    expect(totalIncome({ cash: 8300, digital: 21000 })).toBe(29300);
  });

  it("为 0 时仍正确", () => {
    expect(totalIncome({ cash: 0, digital: 0 })).toBe(0);
  });

  it("formatMoney 带人民币符号与千分位", () => {
    expect(formatMoney(0)).toBe("¥0");
    expect(formatMoney(29300)).toBe("¥29,300");
    expect(formatMoney(1234567.5)).toBe("¥1,234,567.5");
  });
});
