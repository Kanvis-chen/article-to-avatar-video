import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: "127.0.0.1",
    port: 43170,
    strictPort: false,
    proxy: {
      "/api": "http://127.0.0.1:43171",
      "/healthz": "http://127.0.0.1:43171",
    },
  },
  build: {
    sourcemap: true,
    target: "es2023",
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
});
