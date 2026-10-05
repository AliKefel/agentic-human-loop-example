import { defineConfig } from "vitest/config";
import path from "node:path";
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      "server-only": path.resolve(__dirname, "tests/empty.ts"),
    },
  },
  test: { environment: "node", include: ["tests/**/*.test.ts"], env: { NEXT_PUBLIC_MOCK_MODE: "true", MOCK_NO_DELAY: "true" } },
});
