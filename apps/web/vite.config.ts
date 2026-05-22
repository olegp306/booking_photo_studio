import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { rewriteApiProxyPath } from "./src/apiProxy";

export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? "/",
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
        rewrite: rewriteApiProxyPath
      }
    }
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    testTimeout: 20000
  }
});
