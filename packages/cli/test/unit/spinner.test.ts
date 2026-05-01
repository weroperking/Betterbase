import { afterAll, afterEach, describe, expect, it } from "bun:test";

describe("spinner", () => {
  describe("createSpinner", () => {
    it("creates an Ora instance", async () => {
      const ora = await import("ora");
      const spinner = ora.default("testing");
      expect(spinner).toBeDefined();
      expect(spinner.isSpinning).toBe(false);
    });
  });

  describe("withSpinner", () => {
    it("calls task and returns result on success", async () => {
      const { withSpinner } = await import("../../src/utils/spinner");
      const result = await withSpinner(
        "Testing spinner",
        async () => "success_result",
        { successText: "Done" },
      );
      expect(result).toBe("success_result");
    });

    it("re-throws error after catching task failure", async () => {
      const { withSpinner } = await import("../../src/utils/spinner");
      let caught = false;
      try {
        await withSpinner(
          "Testing spinner failure",
          async () => { throw new Error("task failed"); },
          { failText: "Failed" },
        );
      } catch (e: unknown) {
        caught = true;
        expect((e as Error).message).toBe("task failed");
      }
      expect(caught).toBe(true);
    });
  });
});
