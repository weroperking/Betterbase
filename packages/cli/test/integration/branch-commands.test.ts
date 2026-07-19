/**
 * Branch Commands - Integration Behavioral Tests
 *
 * Tests all branch command functions with mocked dependencies.
 * Replaces the 17 stub tests from test/branch-commands.test.ts.
 */

import { afterAll, afterEach, describe, expect, it, mock } from "bun:test";
import path from "node:path";

const configModulePath = path.resolve(__dirname, "../../src/utils/config.ts");

// ── Mutable test state ──────────────────────────────────────────────────────
let mockConfigResult: any = null;

let mockCreateBranchResult: any = {
  success: true,
  branch: {
    id: "branch-1",
    name: "test-branch",
    previewUrl: "https://test-branch.preview.betterbase.io",
    status: "active",
    databaseConnectionString: "postgres://...",
    storageBucket: "test-branch-bucket",
    createdAt: new Date(),
    lastAccessedAt: new Date(),
  },
};
let mockListBranchesResult: any = {
  branches: [
    {
      id: "branch-1",
      name: "test-branch",
      previewUrl: "https://test-branch.preview.betterbase.io",
      status: "active",
      createdAt: new Date(),
      lastAccessedAt: new Date(),
    },
  ],
  total: 1,
  hasMore: false,
};
let mockGetBranchByNameResult: any = {
  id: "branch-1",
  name: "existing-branch",
  previewUrl: "https://existing-branch.preview.betterbase.io",
  status: "active",
  createdAt: new Date(),
  lastAccessedAt: new Date(),
};
let mockDeleteBranchResult: any = { success: true };
let mockSleepBranchResult: any = { success: true };
let mockWakeBranchResult: any = { success: true };

// ── Spies ───────────────────────────────────────────────────────────────────
const createBranchSpy = mock(async (opts: any) => {
  return {
    success: mockCreateBranchResult.success,
    branch: mockCreateBranchResult.branch
      ? { ...mockCreateBranchResult.branch, name: opts.name }
      : undefined,
    error: mockCreateBranchResult.error,
    warnings: mockCreateBranchResult.warnings,
  };
});

const listBranchesSpy = mock(() => ({
  branches: [...mockListBranchesResult.branches],
  total: mockListBranchesResult.total,
  hasMore: mockListBranchesResult.hasMore,
}));

const getBranchByNameSpy = mock((name: string) => {
  if (!mockGetBranchByNameResult) return undefined;
  return { ...mockGetBranchByNameResult, name };
});

const deleteBranchSpy = mock(async (id: string) => ({ ...mockDeleteBranchResult }));
const sleepBranchSpy = mock(async (id: string) => ({ ...mockSleepBranchResult }));
const wakeBranchSpy = mock(async (id: string) => ({ ...mockWakeBranchResult }));

// ── Module mocks ────────────────────────────────────────────────────────────
mock.module("@betterbase/core/branching", () => ({
  createBranchManager: () => ({
    createBranch: createBranchSpy,
    listBranches: listBranchesSpy,
    getBranchByName: getBranchByNameSpy,
    deleteBranch: deleteBranchSpy,
    sleepBranch: sleepBranchSpy,
    wakeBranch: wakeBranchSpy,
  }),
  clearAllBranches: () => {},
  getAllBranches: () => [],
}));

mock.module(configModulePath, () => ({
  loadConfig: async () => mockConfigResult,
  findConfigFile: async () => null,
  readConfigFile: async () => null,
}));

// ── Mock lifecycle hygiene ───────────────────────────────────────────────────
// After all tests in this file, clear the process-global mock.module registry so
// the mocked modules cannot leak into sibling test files in a combined run.
afterAll(() => {
  mock.restore();
});

// ── Dynamically import the module under test ────────────────────────────────
const {
  runBranchCreateCommand,
  runBranchListCommand,
  runBranchDeleteCommand,
  runBranchSleepCommand,
  runBranchWakeCommand,
  runBranchCommand,
} = await import("../../src/commands/branch");

// ── Helpers ─────────────────────────────────────────────────────────────────
function resetMocks() {
  mockConfigResult = null;
  mockCreateBranchResult = {
    success: true,
    branch: {
      id: "branch-1",
      name: "test-branch",
      previewUrl: "https://test-branch.preview.betterbase.io",
      status: "active",
      databaseConnectionString: "postgres://...",
      storageBucket: "test-branch-bucket",
      createdAt: new Date(),
      lastAccessedAt: new Date(),
    },
  };
  mockListBranchesResult = {
    branches: [
      {
        id: "branch-1",
        name: "test-branch",
        previewUrl: "https://test-branch.preview.betterbase.io",
        status: "active",
        createdAt: new Date(),
        lastAccessedAt: new Date(),
      },
    ],
    total: 1,
    hasMore: false,
  };
  mockGetBranchByNameResult = {
    id: "branch-1",
    name: "existing-branch",
    previewUrl: "https://existing-branch.preview.betterbase.io",
    status: "active",
    createdAt: new Date(),
    lastAccessedAt: new Date(),
  };
  mockDeleteBranchResult = { success: true };
  mockSleepBranchResult = { success: true };
  mockWakeBranchResult = { success: true };

  createBranchSpy.mockClear();
  listBranchesSpy.mockClear();
  getBranchByNameSpy.mockClear();
  deleteBranchSpy.mockClear();
  sleepBranchSpy.mockClear();
  wakeBranchSpy.mockClear();
}

const validConfig = {
  project: { name: "test-project" },
  provider: { type: "sqlite", connectionString: "local.db" },
  storage: { provider: "s3", bucket: "test-bucket", region: "us-east-1" },
  webhooks: [],
};

const TEMP_PROJECT_ROOT = path.resolve(__dirname, "../../test-fixtures-fake-dir");

// ═══════════════════════════════════════════════════════════════════════════════
// runBranchCreateCommand
// ═══════════════════════════════════════════════════════════════════════════════
describe("runBranchCreateCommand", () => {
  afterEach(resetMocks);

  it("throws when branch name is not provided", async () => {
    await expect(
      runBranchCreateCommand([], TEMP_PROJECT_ROOT),
    ).rejects.toThrow("Branch name is required. Usage: bb branch create <name>");
  });

  it("throws when config file cannot be loaded", async () => {
    mockConfigResult = null;
    await expect(
      runBranchCreateCommand(["my-feature"], TEMP_PROJECT_ROOT),
    ).rejects.toThrow(
      "Could not load configuration from betterbase.config.ts. Make sure you're in a BetterBase project directory.",
    );
  });

  it("creates a branch successfully with a valid name and config", async () => {
    mockConfigResult = validConfig;
    mockCreateBranchResult = {
      success: true,
      branch: {
        id: "branch-2",
        name: "my-feature",
        previewUrl: "https://my-feature.preview.betterbase.io",
        status: "active",
        databaseConnectionString: "postgres://preview/my-feature",
        storageBucket: "my-feature-bucket",
        createdAt: new Date(),
        lastAccessedAt: new Date(),
      },
    };

    await runBranchCreateCommand(["my-feature"], TEMP_PROJECT_ROOT);

    expect(createBranchSpy).toHaveBeenCalledTimes(1);
    const callArg = createBranchSpy.mock.calls[0][0];
    expect(callArg.name).toBe("my-feature");
    expect(callArg.sourceBranch).toBe("main");
    expect(callArg.copyDatabase).toBe(true);
    expect(callArg.copyStorage).toBe(true);
  });

  it("throws when branch creation fails (success: false)", async () => {
    mockConfigResult = validConfig;
    mockCreateBranchResult = {
      success: false,
      error: "Branch limit exceeded",
    };

    await expect(
      runBranchCreateCommand(["my-feature"], TEMP_PROJECT_ROOT),
    ).rejects.toThrow("Failed to create preview environment: Branch limit exceeded");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// runBranchListCommand
// ═══════════════════════════════════════════════════════════════════════════════
describe("runBranchListCommand", () => {
  afterEach(resetMocks);

  it("throws when config file cannot be loaded", async () => {
    mockConfigResult = null;
    await expect(
      runBranchListCommand([], TEMP_PROJECT_ROOT),
    ).rejects.toThrow(
      "Could not load configuration from betterbase.config.ts. Make sure you're in a BetterBase project directory.",
    );
  });

  it("lists branches when config is valid and branches exist", async () => {
    mockConfigResult = validConfig;
    mockListBranchesResult = {
      branches: [
        {
          id: "b1",
          name: "feature-a",
          previewUrl: "https://feature-a.preview.betterbase.io",
          status: "active",
          createdAt: new Date("2026-01-15"),
          lastAccessedAt: new Date("2026-04-20"),
        },
        {
          id: "b2",
          name: "feature-b",
          previewUrl: "https://feature-b.preview.betterbase.io",
          status: "sleeping",
          createdAt: new Date("2026-02-10"),
          lastAccessedAt: new Date("2026-03-01"),
        },
      ],
      total: 2,
      hasMore: false,
    };

    await runBranchListCommand([], TEMP_PROJECT_ROOT);

    expect(listBranchesSpy).toHaveBeenCalledTimes(1);
  });

  it("shows empty state message when no branches exist", async () => {
    mockConfigResult = validConfig;
    mockListBranchesResult = {
      branches: [],
      total: 0,
      hasMore: false,
    };

    await runBranchListCommand([], TEMP_PROJECT_ROOT);

    expect(listBranchesSpy).toHaveBeenCalledTimes(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// runBranchDeleteCommand
// ═══════════════════════════════════════════════════════════════════════════════
describe("runBranchDeleteCommand", () => {
  afterEach(resetMocks);

  it("throws when branch name is not provided", async () => {
    await expect(
      runBranchDeleteCommand([], TEMP_PROJECT_ROOT),
    ).rejects.toThrow("Branch name is required. Usage: bb branch delete <name>");
  });

  it("throws when config file cannot be loaded", async () => {
    mockConfigResult = null;
    await expect(
      runBranchDeleteCommand(["my-feature"], TEMP_PROJECT_ROOT),
    ).rejects.toThrow(
      "Could not load configuration from betterbase.config.ts. Make sure you're in a BetterBase project directory.",
    );
  });

  it("throws when branch name is not found", async () => {
    mockConfigResult = validConfig;
    mockGetBranchByNameResult = undefined;

    await expect(
      runBranchDeleteCommand(["nonexistent-branch"], TEMP_PROJECT_ROOT),
    ).rejects.toThrow("Preview environment 'nonexistent-branch' not found.");
  });

  it("deletes an existing branch successfully", async () => {
    mockConfigResult = validConfig;
    mockGetBranchByNameResult = {
      id: "branch-xyz",
      name: "stale-feature",
      previewUrl: "https://stale-feature.preview.betterbase.io",
      status: "active",
      createdAt: new Date(),
      lastAccessedAt: new Date(),
    };

    await runBranchDeleteCommand(["stale-feature"], TEMP_PROJECT_ROOT);

    expect(getBranchByNameSpy).toHaveBeenCalledWith("stale-feature");
    expect(deleteBranchSpy).toHaveBeenCalledWith("branch-xyz");
  });

  it("throws when delete operation fails", async () => {
    mockConfigResult = validConfig;
    mockGetBranchByNameResult = {
      id: "branch-xyz",
      name: "stale-feature",
      previewUrl: "https://stale-feature.preview.betterbase.io",
      status: "active",
      createdAt: new Date(),
      lastAccessedAt: new Date(),
    };
    mockDeleteBranchResult = {
      success: false,
      error: "Database cleanup failed",
    };

    await expect(
      runBranchDeleteCommand(["stale-feature"], TEMP_PROJECT_ROOT),
    ).rejects.toThrow("Failed to delete preview environment: Database cleanup failed");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// runBranchSleepCommand
// ═══════════════════════════════════════════════════════════════════════════════
describe("runBranchSleepCommand", () => {
  afterEach(resetMocks);

  it("throws when branch name is not provided", async () => {
    await expect(
      runBranchSleepCommand([], TEMP_PROJECT_ROOT),
    ).rejects.toThrow("Branch name is required. Usage: bb branch sleep <name>");
  });

  it("throws when config file cannot be loaded", async () => {
    mockConfigResult = null;
    await expect(
      runBranchSleepCommand(["my-feature"], TEMP_PROJECT_ROOT),
    ).rejects.toThrow(
      "Could not load configuration from betterbase.config.ts. Make sure you're in a BetterBase project directory.",
    );
  });

  it("throws when branch name is not found", async () => {
    mockConfigResult = validConfig;
    mockGetBranchByNameResult = undefined;

    await expect(
      runBranchSleepCommand(["nonexistent"], TEMP_PROJECT_ROOT),
    ).rejects.toThrow("Preview environment 'nonexistent' not found.");
  });

  it("puts a branch to sleep successfully", async () => {
    mockConfigResult = validConfig;
    mockGetBranchByNameResult = {
      id: "branch-idle",
      name: "idle-feature",
      previewUrl: "https://idle-feature.preview.betterbase.io",
      status: "active",
      createdAt: new Date(),
      lastAccessedAt: new Date(),
    };

    await runBranchSleepCommand(["idle-feature"], TEMP_PROJECT_ROOT);

    expect(getBranchByNameSpy).toHaveBeenCalledWith("idle-feature");
    expect(sleepBranchSpy).toHaveBeenCalledWith("branch-idle");
    expect(sleepBranchSpy).toHaveBeenCalledTimes(1);
  });

  it("throws when sleep operation fails", async () => {
    mockConfigResult = validConfig;
    mockGetBranchByNameResult = {
      id: "branch-idle",
      name: "idle-feature",
      previewUrl: "https://idle-feature.preview.betterbase.io",
      status: "active",
      createdAt: new Date(),
      lastAccessedAt: new Date(),
    };
    mockSleepBranchResult = {
      success: false,
      error: "Branch not in active state",
    };

    await expect(
      runBranchSleepCommand(["idle-feature"], TEMP_PROJECT_ROOT),
    ).rejects.toThrow("Failed to sleep preview environment: Branch not in active state");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// runBranchWakeCommand
// ═══════════════════════════════════════════════════════════════════════════════
describe("runBranchWakeCommand", () => {
  afterEach(resetMocks);

  it("throws when branch name is not provided", async () => {
    await expect(
      runBranchWakeCommand([], TEMP_PROJECT_ROOT),
    ).rejects.toThrow("Branch name is required. Usage: bb branch wake <name>");
  });

  it("throws when config file cannot be loaded", async () => {
    mockConfigResult = null;
    await expect(
      runBranchWakeCommand(["my-feature"], TEMP_PROJECT_ROOT),
    ).rejects.toThrow(
      "Could not load configuration from betterbase.config.ts. Make sure you're in a BetterBase project directory.",
    );
  });

  it("throws when branch name is not found", async () => {
    mockConfigResult = validConfig;
    mockGetBranchByNameResult = undefined;

    await expect(
      runBranchWakeCommand(["nonexistent"], TEMP_PROJECT_ROOT),
    ).rejects.toThrow("Preview environment 'nonexistent' not found.");
  });

  it("wakes a sleeping branch successfully", async () => {
    mockConfigResult = validConfig;
    mockGetBranchByNameResult = {
      id: "branch-dormant",
      name: "dormant-feature",
      previewUrl: "https://dormant-feature.preview.betterbase.io",
      status: "sleeping",
      createdAt: new Date(),
      lastAccessedAt: new Date(),
    };

    await runBranchWakeCommand(["dormant-feature"], TEMP_PROJECT_ROOT);

    expect(getBranchByNameSpy).toHaveBeenCalledWith("dormant-feature");
    expect(wakeBranchSpy).toHaveBeenCalledWith("branch-dormant");
    expect(wakeBranchSpy).toHaveBeenCalledTimes(1);
  });

  it("throws when wake operation fails", async () => {
    mockConfigResult = validConfig;
    mockGetBranchByNameResult = {
      id: "branch-dormant",
      name: "dormant-feature",
      previewUrl: "https://dormant-feature.preview.betterbase.io",
      status: "sleeping",
      createdAt: new Date(),
      lastAccessedAt: new Date(),
    };
    mockWakeBranchResult = {
      success: false,
      error: "Wake quota exceeded",
    };

    await expect(
      runBranchWakeCommand(["dormant-feature"], TEMP_PROJECT_ROOT),
    ).rejects.toThrow("Failed to wake preview environment: Wake quota exceeded");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// runBranchCommand — routing
// ═══════════════════════════════════════════════════════════════════════════════
describe("runBranchCommand routing", () => {
  afterEach(resetMocks);

  describe('"create" subcommand', () => {
    it("dispatches to runBranchCreateCommand", async () => {
      mockConfigResult = validConfig;

      await runBranchCommand(["create", "my-branch"], TEMP_PROJECT_ROOT);

      expect(createBranchSpy).toHaveBeenCalledTimes(1);
    });

    it("re-throws errors from create (e.g. missing name)", async () => {
      await expect(
        runBranchCommand(["create"], TEMP_PROJECT_ROOT),
      ).rejects.toThrow("Branch name is required");
    });
  });

  describe('"list" and "ls" subcommands', () => {
    it('dispatches "list" to runBranchListCommand', async () => {
      mockConfigResult = validConfig;

      await runBranchCommand(["list"], TEMP_PROJECT_ROOT);

      expect(listBranchesSpy).toHaveBeenCalledTimes(1);
    });

    it('dispatches "ls" alias to runBranchListCommand', async () => {
      mockConfigResult = validConfig;

      await runBranchCommand(["ls"], TEMP_PROJECT_ROOT);

      expect(listBranchesSpy).toHaveBeenCalledTimes(1);
    });

    it("re-throws errors from list (e.g. missing config)", async () => {
      mockConfigResult = null;

      await expect(
        runBranchCommand(["list"], TEMP_PROJECT_ROOT),
      ).rejects.toThrow("Could not load configuration");
    });
  });

  describe('"delete", "remove", and "rm" subcommands', () => {
    it('dispatches "delete" to runBranchDeleteCommand', async () => {
      mockConfigResult = validConfig;
      mockGetBranchByNameResult = {
        id: "b-del",
        name: "to-delete",
        previewUrl: "https://to-delete.preview.betterbase.io",
        status: "active",
        createdAt: new Date(),
        lastAccessedAt: new Date(),
      };

      await runBranchCommand(["delete", "to-delete"], TEMP_PROJECT_ROOT);

      expect(deleteBranchSpy).toHaveBeenCalledTimes(1);
    });

    it('dispatches "remove" alias to runBranchDeleteCommand', async () => {
      mockConfigResult = validConfig;
      mockGetBranchByNameResult = {
        id: "b-rm",
        name: "to-remove",
        previewUrl: "https://to-remove.preview.betterbase.io",
        status: "active",
        createdAt: new Date(),
        lastAccessedAt: new Date(),
      };

      await runBranchCommand(["remove", "to-remove"], TEMP_PROJECT_ROOT);

      expect(deleteBranchSpy).toHaveBeenCalledTimes(1);
    });

    it('dispatches "rm" alias to runBranchDeleteCommand', async () => {
      mockConfigResult = validConfig;
      mockGetBranchByNameResult = {
        id: "b-rm2",
        name: "to-rm",
        previewUrl: "https://to-rm.preview.betterbase.io",
        status: "active",
        createdAt: new Date(),
        lastAccessedAt: new Date(),
      };

      await runBranchCommand(["rm", "to-rm"], TEMP_PROJECT_ROOT);

      expect(deleteBranchSpy).toHaveBeenCalledTimes(1);
    });

    it("re-throws errors from delete (e.g. missing name)", async () => {
      await expect(
        runBranchCommand(["delete"], TEMP_PROJECT_ROOT),
      ).rejects.toThrow("Branch name is required");
    });
  });

  describe('"sleep" subcommand', () => {
    it("dispatches to runBranchSleepCommand", async () => {
      mockConfigResult = validConfig;
      mockGetBranchByNameResult = {
        id: "b-sleep",
        name: "nap-time",
        previewUrl: "https://nap-time.preview.betterbase.io",
        status: "active",
        createdAt: new Date(),
        lastAccessedAt: new Date(),
      };

      await runBranchCommand(["sleep", "nap-time"], TEMP_PROJECT_ROOT);

      expect(sleepBranchSpy).toHaveBeenCalledTimes(1);
    });

    it("re-throws errors from sleep (e.g. missing name)", async () => {
      await expect(
        runBranchCommand(["sleep"], TEMP_PROJECT_ROOT),
      ).rejects.toThrow("Branch name is required");
    });
  });

  describe('"wake" subcommand', () => {
    it("dispatches to runBranchWakeCommand", async () => {
      mockConfigResult = validConfig;
      mockGetBranchByNameResult = {
        id: "b-wake",
        name: "rise-shine",
        previewUrl: "https://rise-shine.preview.betterbase.io",
        status: "sleeping",
        createdAt: new Date(),
        lastAccessedAt: new Date(),
      };

      await runBranchCommand(["wake", "rise-shine"], TEMP_PROJECT_ROOT);

      expect(wakeBranchSpy).toHaveBeenCalledTimes(1);
    });

    it("re-throws errors from wake (e.g. missing name)", async () => {
      await expect(
        runBranchCommand(["wake"], TEMP_PROJECT_ROOT),
      ).rejects.toThrow("Branch name is required");
    });
  });

  describe("no subcommand", () => {
    it("shows help without throwing", async () => {
      await runBranchCommand([], TEMP_PROJECT_ROOT);

      // Help is printed to stdout — verify no error thrown
    });

    it("shows help when args are undefined", async () => {
      await runBranchCommand(undefined as any, TEMP_PROJECT_ROOT);

      // Help is printed to stdout — verify no error thrown
    });
  });

  describe("unknown subcommand", () => {
    it("throws for unrecognized subcommand", async () => {
      await expect(
        runBranchCommand(["foobar"], TEMP_PROJECT_ROOT),
      ).rejects.toThrow("Unknown branch command: foobar");
    });

    it("throws for any random string", async () => {
      await expect(
        runBranchCommand(["xyzzy"], TEMP_PROJECT_ROOT),
      ).rejects.toThrow("Unknown branch command: xyzzy");
    });
  });
});
