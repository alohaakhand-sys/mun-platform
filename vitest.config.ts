import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Node-environment unit tests for the PURE modules only (currently the Chair Flow Bar's
 * `flowModel.ts`). There is deliberately no jsdom setup and no Firebase stub: a module that needs
 * either does not belong under test here — `@/lib/firebase/client` initializes at import scope and
 * `getDatabase()` throws without NEXT_PUBLIC_FIREBASE_DATABASE_URL, so an accidental value-import
 * of a service into a "pure" module fails these tests loudly. That failure is the point.
 */
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
