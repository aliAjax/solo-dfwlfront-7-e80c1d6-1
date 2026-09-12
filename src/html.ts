/**
 * HTML 文本转义：把用户输入作为纯文本安全地拼入 HTML 字符串。
 * 纯字符串替换（不依赖 DOM），覆盖引号，文本节点与属性值均可使用。
 */
const ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
};

export function escapeHtml(text: unknown): string {
  return String(text ?? "").replace(/[&<>"']/g, (ch) => ESCAPE_MAP[ch]);
}
