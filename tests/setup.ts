import { beforeEach } from "vitest";

// 每个用例前清空本地存储，保证 store 首次创建时读取的是干净环境
beforeEach(() => {
  localStorage.clear();
});
