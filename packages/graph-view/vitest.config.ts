import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "node", // DOM tests opt in per-file with @vitest-environment jsdom
    include: ["src/**/*.test.{ts,tsx}"],
    testTimeout: 30000,
  },
});
