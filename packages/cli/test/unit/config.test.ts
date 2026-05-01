import { afterAll, afterEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { findConfigFile } from "../../src/utils/config";

describe("config", () => {
  let tempDir: string;

  afterEach(() => {
    if (tempDir) {
      try { rmSync(tempDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  });

  function createTempDir(): string {
    const dir = join(tmpdir(), `bb-config-test-${randomUUID().slice(0, 8)}`);
    mkdirSync(dir, { recursive: true });
    return dir;
  }

  describe("findConfigFile", () => {
    it("discovers betterbase.config.ts", async () => {
      tempDir = createTempDir();
      writeFileSync(join(tempDir, "betterbase.config.ts"), "export default {}");

      const result = await findConfigFile(tempDir);
      expect(result).toBe(join(tempDir, "betterbase.config.ts"));
    });

    it("discovers betterbase.config.js when .ts not present", async () => {
      tempDir = createTempDir();
      writeFileSync(join(tempDir, "betterbase.config.js"), "export default {}");

      const result = await findConfigFile(tempDir);
      expect(result).toBe(join(tempDir, "betterbase.config.js"));
    });

    it("discovers betterbase.config.mts when .ts and .js not present", async () => {
      tempDir = createTempDir();
      writeFileSync(join(tempDir, "betterbase.config.mts"), "export default {}");

      const result = await findConfigFile(tempDir);
      expect(result).toBe(join(tempDir, "betterbase.config.mts"));
    });

    it("prefers .ts variant over .js and .mts", async () => {
      tempDir = createTempDir();
      writeFileSync(join(tempDir, "betterbase.config.ts"), "ts");
      writeFileSync(join(tempDir, "betterbase.config.js"), "js");
      writeFileSync(join(tempDir, "betterbase.config.mts"), "mts");

      const result = await findConfigFile(tempDir);
      expect(result).toBe(join(tempDir, "betterbase.config.ts"));
    });

    it("returns null when no config file exists", async () => {
      tempDir = createTempDir();

      const result = await findConfigFile(tempDir);
      expect(result).toBeNull();
    });
  });
});
