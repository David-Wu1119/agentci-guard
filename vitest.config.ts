import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    restoreMocks: true,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // action.ts is a two-line bin shim exercised by the subprocess tests.
      exclude: ["src/action.ts"],
      reporter: ["text-summary", "text"],
      // Ratchet: these are floors, raise them when coverage rises. A drop
      // below any of them fails `pnpm check`.
      thresholds: {
        lines: 90,
        statements: 90,
        functions: 90,
        branches: 80,
      },
    },
  },
});
