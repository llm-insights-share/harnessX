import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@harnessx/core/": r("./packages/core/src/") ,
      "@harnessx/core": r("./packages/core/src/index.ts"),
      "@harnessx/sensors": r("./packages/sensors/src/index.ts"),
      "@harnessx/adapters": r("./packages/adapters/src/index.ts")
    }
  },
  test: {
    include: ["packages/**/test/**/*.test.ts"],
    testTimeout: 30000,
    hookTimeout: 30000
  }
});
