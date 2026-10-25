import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    environment: "node",
    globals: false,
    include: ["tests/**/*.test.ts"],
    globalSetup: ["./tests/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env: {
      NODE_ENV: "test",
      MMA_TEST: "1",
      DATABASE_URL: "file:./data/test.db",
      AUTH_SECRET: "test-secret-do-not-use-in-production-0123456789",
      APP_URL: "http://localhost:3000",
      BOOTSTRAP_ADMIN_ENABLED: "false",
      STRIPE_WEBHOOK_SECRET: "whsec_test_secret_for_vitest",
    },
  },
});
