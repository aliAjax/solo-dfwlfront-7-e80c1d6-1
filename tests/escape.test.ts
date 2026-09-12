import { describe, expect, it } from "vitest";
import { escapeHtml } from "../src/html";

describe("escapeHtml 转义边界", () => {
  it("转义五个 HTML 特殊字符", () => {
    expect(escapeHtml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&#39;");
  });

  it("& 必须最先替换，避免二次转义实体本身", () => {
    expect(escapeHtml("a & b")).toBe("a &amp; b");
    expect(escapeHtml("&amp;")).toBe("&amp;amp;");
    expect(escapeHtml("&lt;")).toBe("&amp;lt;");
  });

  it("注入载荷转义后不含可解析标签", () => {
    const payload = `<img src=x onerror="window.__XSS=1"><script>alert(1)</script>`;
    const out = escapeHtml(payload);
    expect(out).not.toContain("<");
    expect(out).not.toContain(">");
    expect(out).toContain("&lt;img");
    expect(out).toContain("&lt;script&gt;");
  });

  it("转义结果放进 innerHTML 后不会产生额外节点", () => {
    const el = document.createElement("div");
    el.innerHTML = `<strong>${escapeHtml(
      `<测试>站<b onmouseover="x">B</b><img src=x onerror="window.__XSS=1">`
    )}</strong>`;
    expect(el.querySelectorAll("b, img, script, strong *").length).toBe(0);
    expect(el.querySelector("strong")?.textContent).toContain("<测试>站");
    expect(el.querySelector("strong")?.textContent).toContain("<img src=x");
    expect((window as { __XSS?: number }).__XSS).toBeUndefined();
  });

  it("转义引号后用于属性值不会逃逸出新属性", () => {
    const attr = escapeHtml(`" onmouseover="alert(1)`);
    const el = document.createElement("div");
    el.innerHTML = `<button data-x="${attr}">x</button>`;
    const btn = el.querySelector("button")!;
    expect(btn.getAttribute("onmouseover")).toBeNull();
    expect(btn.getAttribute("data-x")).toBe(`" onmouseover="alert(1)`);
  });

  it("普通中文、数字、符号原样输出", () => {
    expect(escapeHtml("中石化朝阳加油站")).toBe("中石化朝阳加油站");
    expect(escapeHtml("a=b+c-d/中文 空格·!@#%^*()")).toBe("a=b+c-d/中文 空格·!@#%^*()");
  });

  it("空串安全，null/undefined 归一为空串，数字按字符串处理", () => {
    expect(escapeHtml("")).toBe("");
    expect(escapeHtml(null)).toBe("");
    expect(escapeHtml(undefined)).toBe("");
    expect(escapeHtml(0)).toBe("0");
  });
});
