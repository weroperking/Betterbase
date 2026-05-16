/**
 * RLS Test Command — Behavioral Tests
 *
 * Tests for cli/src/commands/rls-test.ts.
 * Covers getDatabaseUrl, loadTablePolicies, generatePolicySQL,
 * runRLSTestCommand, RLSTestCase, and RLSTestResult types
 * without requiring a real PostgreSQL connection.
 */

import { afterAll, afterEach, describe, expect, it, mock } from "bun:test";
import path from "node:path";
import { createTestProject } from "../fixtures/fixtures";
import type { RLSTestCase, RLSTestResult } from "../../src/commands/rls-test";

// ── Mock state ────────────────────────────────────────────────────────────────

let capturedSqlCalls: string[] = [];
let capturedDbUrl: string | null = null;
let mockDbType: "postgresql" | "sqlite" = "postgresql";

function resetCaptures() {
  capturedSqlCalls = [];
  capturedDbUrl = null;
}

// ── Env helpers ───────────────────────────────────────────────────────────────

function saveEnv() {
  return {
    DATABASE_URL: process.env.DATABASE_URL,
    DB_URL: process.env.DB_URL,
  };
}

function restoreEnv(orig: ReturnType<typeof saveEnv>) {
  if (orig.DATABASE_URL !== undefined) process.env.DATABASE_URL = orig.DATABASE_URL;
  else delete process.env.DATABASE_URL;
  if (orig.DB_URL !== undefined) process.env.DB_URL = orig.DB_URL;
  else delete process.env.DB_URL;
}

// ── Mock: postgres ────────────────────────────────────────────────────────────

function createMockSqlClient() {
  const sqlFn: any = (first: any, ...rest: any[]) => {
    if (Array.isArray(first)) {
      const query = String.raw({ raw: first }, ...rest);
      capturedSqlCalls.push(query);
      if (query.includes("information_schema.columns")) {
        if (query.includes("SELECT 1")) {
          return Promise.resolve([{ column_name: "user_id" }]);
        }
        return Promise.resolve([
          { column_name: "id" },
          { column_name: "user_id" },
          { column_name: "created_at" },
        ]);
      }
      if (query.includes("information_schema.tables")) {
        return Promise.resolve([{ 1: 1 }]);
      }
      if (query.includes("pg_class")) {
        return Promise.resolve([{ relrowsecurity: true }]);
      }
      return Promise.resolve([]);
    }
    return first;
  };
  sqlFn.unsafe = (sqlStr: string) => {
    capturedSqlCalls.push(sqlStr);
    if (sqlStr.toLowerCase().startsWith("select")) return Promise.resolve([{ row: 1 }]);
    return Promise.resolve({});
  };
  sqlFn.end = () => Promise.resolve();
  return sqlFn;
}

const mockPostgresFn = mock((url: string) => {
  capturedDbUrl = url;
  return createMockSqlClient();
});

mock.module("postgres", () => ({
  default: mockPostgresFn,
}));

// ── Mock: migrate-utils (getDatabaseType) ─────────────────────────────────────

const migrateUtilsPath = path.resolve(
  __dirname,
  "../../src/commands/migrate-utils.ts",
);

mock.module(migrateUtilsPath, () => ({
  getDatabaseType: () => mockDbType,
  calculateChecksum: () => "",
  parseMigrationFilename: () => null,
  getMigrationsTableSql: () => "",
  loadMigrationFiles: async () => [],
}));

// ── Dynamic import ────────────────────────────────────────────────────────────

const { runRLSTestCommand } = await import("../../src/commands/rls-test");

// ═══════════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe("RLS Test Command", () => {
  afterEach(() => {
    resetCaptures();
  });

  afterAll(() => {
    mock.restore();
  });

  // ── RLSTestCase type (test 11) ──────────────────────────────────────────────

  describe("RLSTestCase type", () => {
    it("has correct shape with all required fields", () => {
      const tc: RLSTestCase = {
        name: "Can select own rows",
        user_id: "user-1",
        query: "SELECT * FROM test_table",
        expected: "allowed",
      };

      expect(tc).toHaveProperty("name");
      expect(tc).toHaveProperty("user_id");
      expect(tc).toHaveProperty("query");
      expect(tc).toHaveProperty("expected");
      expect(typeof tc.name).toBe("string");
      expect(typeof tc.user_id).toBe("string");
      expect(typeof tc.query).toBe("string");
      expect(tc.expected).toBe("allowed");
      expect(tc.expectedRowCount).toBeUndefined();
    });

    it("supports optional expectedRowCount field on blocked tests", () => {
      const tc: RLSTestCase = {
        name: "Cannot see others",
        user_id: "user-1",
        query: "SELECT * FROM test_table WHERE user_id = 'other'",
        expected: "blocked",
        expectedRowCount: 0,
      };

      expect(tc.expectedRowCount).toBe(0);
      expect(tc.expected).toBe("blocked");
      expect(tc.name).toBe("Cannot see others");
    });
  });

  // ── RLSTestResult type (test 12) ────────────────────────────────────────────

  describe("RLSTestResult type", () => {
    it("has correct shape with all fields", () => {
      const result: RLSTestResult = {
        test: "Can select own rows",
        passed: true,
        actual: "allowed",
        expected: "allowed",
        rowCount: 1,
      };

      expect(result).toHaveProperty("test");
      expect(result).toHaveProperty("passed");
      expect(result).toHaveProperty("actual");
      expect(result).toHaveProperty("expected");
      expect(typeof result.test).toBe("string");
      expect(typeof result.passed).toBe("boolean");
      expect(result.actual).toBe("allowed");
      expect(result.expected).toBe("allowed");
      expect(result.rowCount).toBe(1);
      expect(result.error).toBeUndefined();
    });

    it("includes optional error field for failure results", () => {
      const result: RLSTestResult = {
        test: "Cannot select others",
        passed: false,
        actual: "blocked",
        expected: "allowed",
        error: "permission denied for table users",
      };

      expect(result.passed).toBe(false);
      expect(result.actual).toBe("blocked");
      expect(result.expected).toBe("allowed");
      expect(result.error).toBe("permission denied for table users");
      expect(result.rowCount).toBeUndefined();
    });
  });

  // ── getDatabaseUrl (tests 1–2) ──────────────────────────────────────────────

   describe("getDatabaseUrl", () => {
     it("returns DATABASE_URL when set in env", async () => {
       const env = saveEnv();
       process.env.DATABASE_URL = "postgres://localhost:5432/testdb";
       delete process.env.DB_URL;
       mockDbType = "postgresql";

       try {
         try {
           await runRLSTestCommand("/fake/project", "users");
         } catch {
           // Expected — no real DB
         }

         expect(capturedDbUrl).toBe("postgres://localhost:5432/testdb");
       } finally {
         restoreEnv(env);
       }
     });

     it("throws when DATABASE_URL is not set", async () => {
       const env = saveEnv();
       delete process.env.DATABASE_URL;
       delete process.env.DB_URL;
       mockDbType = "postgresql";

       try {
         await expect(
           runRLSTestCommand("/fake/project", "users"),
         ).rejects.toThrow(
           "DATABASE_URL not found in environment. Please ensure you have a PostgreSQL database configured.",
         );

         expect(capturedDbUrl).toBeNull();
       } finally {
         restoreEnv(env);
       }
     });
   });

  // ── loadTablePolicies (tests 3–4) ───────────────────────────────────────────

  describe("loadTablePolicies", () => {
    it("returns defaults when no policies directory exists", async () => {
      const env = saveEnv();
      process.env.DATABASE_URL = "postgres://localhost:5432/db";
      delete process.env.DB_URL;
      mockDbType = "postgresql";

      const proj = createTestProject({});

      try {
        try {
          await runRLSTestCommand(proj.root, "users");
        } catch {
          // Expected — no real DB
        }

        const policyStmts = capturedSqlCalls.filter((s) =>
          s.toUpperCase().includes("CREATE POLICY"),
        );

        expect(policyStmts.length).toBe(4);
        for (const stmt of policyStmts) {
          expect(stmt).toContain("auth.uid() = user_id");
        }
      } finally {
        proj.cleanup();
        restoreEnv(env);
      }
    });

    it("reads policy files correctly and extracts operations", async () => {
      const env = saveEnv();
      process.env.DATABASE_URL = "postgres://localhost:5432/db";
      delete process.env.DB_URL;
      mockDbType = "postgresql";

      const proj = createTestProject({
        "src/db/policies/users_select.policy.ts": `
          export default {
            select: "auth.uid() = owner_id",
          };
        `,
        "src/db/policies/users_insert.policy.ts": `
          export default {
            insert: "auth.uid() IS NOT NULL",
          };
        `,
      });

      try {
        try {
          await runRLSTestCommand(proj.root, "users");
        } catch {
          // Expected — no real DB
        }

        const policyStmts = capturedSqlCalls.filter((s) =>
          s.toUpperCase().includes("CREATE POLICY"),
        );

        expect(policyStmts.length).toBe(2);

        const selectStmt = policyStmts.find((s) => s.includes("FOR SELECT"));
        expect(selectStmt).toBeDefined();
        expect(selectStmt!).toContain("auth.uid() = owner_id");

        const insertStmt = policyStmts.find((s) => s.includes("FOR INSERT"));
        expect(insertStmt).toBeDefined();
        expect(insertStmt!).toContain("auth.uid() IS NOT NULL");
        expect(insertStmt!).toContain("WITH CHECK");
      } finally {
        proj.cleanup();
        restoreEnv(env);
      }
    });

    it("returns defaults when no matching .policy.ts files found for table", async () => {
      const env = saveEnv();
      process.env.DATABASE_URL = "postgres://localhost:5432/db";
      delete process.env.DB_URL;
      mockDbType = "postgresql";

      const proj = createTestProject({
        "src/db/policies/other_table.policy.ts": `
          export default { select: "auth.uid() = user_id" };
        `,
      });

      try {
        try {
          await runRLSTestCommand(proj.root, "users");
        } catch {
          // Expected — no real DB
        }

        const policyStmts = capturedSqlCalls.filter((s) =>
          s.toUpperCase().includes("CREATE POLICY"),
        );

        expect(policyStmts.length).toBe(4);
        for (const stmt of policyStmts) {
          expect(stmt).toContain("auth.uid() = user_id");
        }
      } finally {
        proj.cleanup();
        restoreEnv(env);
      }
    });
  });

  // ── generatePolicySQL (tests 5–8) ───────────────────────────────────────────

  describe("generatePolicySQL", () => {
    it("generates CREATE POLICY for select only", async () => {
      const env = saveEnv();
      process.env.DATABASE_URL = "postgres://localhost:5432/db";
      delete process.env.DB_URL;
      mockDbType = "postgresql";

      const proj = createTestProject({
        "src/db/policies/users_policy.policy.ts": `
          export default {
            select: "auth.uid() = user_id",
          };
        `,
      });

      try {
        try {
          await runRLSTestCommand(proj.root, "users");
        } catch {
          // Expected — no real DB
        }

        const policyStmts = capturedSqlCalls.filter((s) =>
          s.toUpperCase().includes("CREATE POLICY"),
        );

        expect(policyStmts.length).toBe(1);
        expect(policyStmts[0]).toContain("FOR SELECT USING (");
        expect(policyStmts[0]).not.toContain("FOR INSERT");
        expect(policyStmts[0]).not.toContain("FOR UPDATE");
        expect(policyStmts[0]).not.toContain("FOR DELETE");
      } finally {
        proj.cleanup();
        restoreEnv(env);
      }
    });

    it("generates CREATE POLICY for select + insert", async () => {
      const env = saveEnv();
      process.env.DATABASE_URL = "postgres://localhost:5432/db";
      delete process.env.DB_URL;
      mockDbType = "postgresql";

      const proj = createTestProject({
        "src/db/policies/users_policy.policy.ts": `
          export default {
            select: "auth.uid() = user_id",
            insert: "auth.uid() = user_id",
          };
        `,
      });

      try {
        try {
          await runRLSTestCommand(proj.root, "users");
        } catch {
          // Expected — no real DB
        }

        const policyStmts = capturedSqlCalls.filter((s) =>
          s.toUpperCase().includes("CREATE POLICY"),
        );

        expect(policyStmts.length).toBe(2);
        expect(policyStmts[0]).toContain("FOR SELECT USING (");
        expect(policyStmts[1]).toContain("FOR INSERT WITH CHECK (");
      } finally {
        proj.cleanup();
        restoreEnv(env);
      }
    });

    it("generates CREATE POLICY for all operations", async () => {
      const env = saveEnv();
      process.env.DATABASE_URL = "postgres://localhost:5432/db";
      delete process.env.DB_URL;
      mockDbType = "postgresql";

      const proj = createTestProject({
        "src/db/policies/users_policy.policy.ts": `
          export default {
            select: "auth.uid() = user_id",
            insert: "auth.uid() = user_id",
            update: "auth.uid() = user_id",
            delete: "auth.uid() = user_id",
          };
        `,
      });

      try {
        try {
          await runRLSTestCommand(proj.root, "users");
        } catch {
          // Expected — no real DB
        }

        const policyStmts = capturedSqlCalls.filter((s) =>
          s.toUpperCase().includes("CREATE POLICY"),
        );

        expect(policyStmts.length).toBe(1);
        const combined = policyStmts[0];
        expect(combined).toContain("FOR SELECT USING (");
        expect(combined).toContain("FOR INSERT WITH CHECK (");
        expect(combined).toContain("FOR UPDATE USING (");
        expect(combined).toContain("FOR DELETE USING (");
        expect((combined.match(/CREATE POLICY/gi) || []).length).toBe(4);
      } finally {
        proj.cleanup();
        restoreEnv(env);
      }
    });

    it("returns empty string when policy file has no operations", async () => {
      const env = saveEnv();
      process.env.DATABASE_URL = "postgres://localhost:5432/db";
      delete process.env.DB_URL;
      mockDbType = "postgresql";

      const proj = createTestProject({
        "src/db/policies/users_empty.policy.ts": `
          export const policy = {
            name: "test_policy",
          };
        `,
      });

      try {
        try {
          await runRLSTestCommand(proj.root, "users");
        } catch {
          // Expected — no real DB
        }

        const policyStmts = capturedSqlCalls.filter((s) =>
          s.toUpperCase().includes("CREATE POLICY"),
        );

        expect(policyStmts.length).toBe(0);
      } finally {
        proj.cleanup();
        restoreEnv(env);
      }
    });
  });

  // ── runRLSTestCommand DB type validation (tests 9–10) ───────────────────────

  describe("runRLSTestCommand database type validation", () => {
    it("rejects non-PostgreSQL database type", async () => {
      const env = saveEnv();
      process.env.DATABASE_URL = "file:./local.db";
      delete process.env.DB_URL;
      mockDbType = "sqlite";

      try {
        await expect(
          runRLSTestCommand("/fake/project", "users"),
        ).rejects.toThrow(
          "RLS testing is only supported for PostgreSQL databases. Current: sqlite",
        );
      } finally {
        restoreEnv(env);
      }
    });

    it("throws when DATABASE_URL is missing", async () => {
      const env = saveEnv();
      delete process.env.DATABASE_URL;
      delete process.env.DB_URL;
      mockDbType = "postgresql";

      try {
        await expect(
          runRLSTestCommand("/fake/project", "users"),
        ).rejects.toThrow("DATABASE_URL not found in environment");
      } finally {
        restoreEnv(env);
      }
    });
  });
});
