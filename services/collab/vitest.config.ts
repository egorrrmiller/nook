import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Tests bind real TCP ports; keep them in one worker so ports never collide.
    fileParallelism: false,
    environment: "node",
  },
});
