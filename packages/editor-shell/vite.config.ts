import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: "demo",
  plugins: [react()],
  server: { port: 5183, strictPort: true },
  build: {
    outDir: "../demo-dist",
    emptyOutDir: true,
    // §7.8.3 bundle-size spike: `npm run demo:build` prints chunk sizes —
    // record OUR measured number, trust no circulated figures.
    chunkSizeWarningLimit: 4000,
  },
});
