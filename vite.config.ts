import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  root: "client", // ✅ needed if your index.html lives in client/
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "client/src"),
      "@shared": path.resolve(__dirname, "shared"),
      "@assets": path.resolve(__dirname, "client/src/assets"),
    },
  },
  server: {
    host: "0.0.0.0",       // ✅ required for Replit preview
    port: 5000,
    allowedHosts: true,   // ✅ fixes the blocked host issue
  },
  build: {
    outDir: "../dist",     // ✅ necessary if you're customizing build location
    emptyOutDir: true,
  },
});
