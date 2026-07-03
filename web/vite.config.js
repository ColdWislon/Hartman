import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The API base is injected at build/runtime via VITE_API_BASE.
// In docker-compose the web container proxies /api to the api service.
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      "/api": {
        target: process.env.VITE_API_TARGET || "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
});
