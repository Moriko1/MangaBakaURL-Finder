import { defineConfig } from "vitest/config";

export default defineConfig({
  define: {
    __ADULT_PROVIDERS_ENABLED__: "true",
    __BUILD_VARIANT__: JSON.stringify("complete"),
    __LOCAL_RELEASE_UPDATES_ENABLED__: "false",
  },
  test: {
    clearMocks: true,
    environment: "jsdom",
    include: ["tests/**/*.test.{ts,mjs}"],
    restoreMocks: true,
  },
});
