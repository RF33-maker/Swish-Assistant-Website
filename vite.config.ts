import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  root: "client",
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "client/src"),
      "@shared": path.resolve(__dirname, "shared"), // adjust if shared is outside client
      "@assets": path.resolve(__dirname, "client/src/assets"),
    },
  },
  build: {
    outDir: "../dist",
    emptyOutDir: true,
  },
});