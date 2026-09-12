import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          echarts: ["echarts"],
          leaflet: ["leaflet"],
          "element-plus": ["element-plus"],
          vendor: ["vue", "pinia"]
        }
      }
    }
  }
});
