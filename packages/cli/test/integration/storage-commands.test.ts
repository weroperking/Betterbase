/**
 * Storage Commands — Integration Behavioral Tests
 *
 * Tests runStorageBucketsListCommand and runStorageUploadCommand with mocked
 * @betterbase/core/storage and config loader.  Internal helpers (formatBytes,
 * getContentType, getStorageConfigFromEnv, generateStorageConfigBlock, etc.)
 * are exercised indirectly through exported command output and spy assertions.
 */

import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { createTestProject } from "../fixtures/fixtures";

// ── Mutable mock state ───────────────────────────────────────────────────────
let mockConfigResult: any = null;

let mockListObjectsResult: Array<{ key: string; size: number; lastModified: Date }> = [
  { key: "file1.txt", size: 1024, lastModified: new Date("2024-01-15") },
  { key: "folder/file2.png", size: 2048, lastModified: new Date("2024-01-16") },
];

let mockUploadResult = { key: "uploaded.txt", size: 512, contentType: "text/plain" };
let mockGetPublicUrlResult = "https://test-bucket.s3.us-east-1.amazonaws.com/uploaded.txt";
let mockCreateSignedUrlResult = "https://signed.example.com/uploaded.txt?token=abc";

// ── Spies ────────────────────────────────────────────────────────────────────
const listObjectsSpy = mock(async (_bucket: string) => {
  if (mockListObjectsResult.length > 0) {
    return [...mockListObjectsResult];
  }
  return [];
});

const uploadSpy = mock(
  async (_bucket: string, _key: string, _content: Buffer, _opts?: any) => ({
    ...mockUploadResult,
  }),
);

const getPublicUrlSpy = mock((_bucket: string, _key: string) => mockGetPublicUrlResult);

const createSignedUrlSpy = mock(async (_bucket: string, _key: string, _opts?: any) =>
  mockCreateSignedUrlResult,
);

// ── Module mocks (must precede dynamic import) ───────────────────────────────
mock.module("@betterbase/core/storage", () => ({
  createS3Adapter: () => ({
    listObjects: listObjectsSpy,
    upload: uploadSpy,
    getPublicUrl: getPublicUrlSpy,
    createSignedUrl: createSignedUrlSpy,
  }),
  createStorage: () => ({}),
}));

const configModulePath = path.resolve(__dirname, "../../src/utils/config.ts");
mock.module(configModulePath, () => ({
  loadConfig: async () => mockConfigResult,
  findConfigFile: async () => null,
  readConfigFile: async () => null,
}));

// ── Dynamic import ───────────────────────────────────────────────────────────
const { runStorageBucketsListCommand, runStorageUploadCommand } = await import(
  "../../src/commands/storage"
);

// ── Helpers ──────────────────────────────────────────────────────────────────
const VALID_CONFIG = {
  storage: { provider: "s3", bucket: "test-bucket", region: "us-east-1" },
};

const ENV_CREDS = {
  STORAGE_ACCESS_KEY: "test-access-key",
  STORAGE_SECRET_KEY: "test-secret-key",
};

function setEnv(vars: Record<string, string>) {
  for (const [k, v] of Object.entries(vars)) {
    process.env[k] = v;
  }
}

function clearEnv(vars: Record<string, string>) {
  for (const k of Object.keys(vars)) {
    delete process.env[k];
  }
}

function resetMocks() {
  mockConfigResult = null;
  mockListObjectsResult = [
    { key: "file1.txt", size: 1024, lastModified: new Date("2024-01-15") },
    { key: "folder/file2.png", size: 2048, lastModified: new Date("2024-01-16") },
  ];
  mockUploadResult = { key: "uploaded.txt", size: 512, contentType: "text/plain" };
  mockGetPublicUrlResult = "https://test-bucket.s3.us-east-1.amazonaws.com/uploaded.txt";
  mockCreateSignedUrlResult = "https://signed.example.com/uploaded.txt?token=abc";

  listObjectsSpy.mockClear();
  uploadSpy.mockClear();
  getPublicUrlSpy.mockClear();
  createSignedUrlSpy.mockClear();
}

// ═══════════════════════════════════════════════════════════════════════════════
// runStorageBucketsListCommand
// ═══════════════════════════════════════════════════════════════════════════════
describe("runStorageBucketsListCommand", () => {
  let logSpy: ReturnType<typeof spyOn>;
  let errorSpy: ReturnType<typeof spyOn>;

  afterEach(() => {
    resetMocks();
    clearEnv(ENV_CREDS);
    clearEnv({ STORAGE_PROVIDER: "", STORAGE_BUCKET: "" });
    logSpy?.mockRestore();
    errorSpy?.mockRestore();
  });

  it("errors when storage is not configured (no config, no env)", async () => {
    mockConfigResult = null;
    logSpy = spyOn(console, "log").mockImplementation(() => {});
    errorSpy = spyOn(console, "error").mockImplementation(() => {});

    await runStorageBucketsListCommand("/fake/project");

    const errorCalls = errorSpy.mock.calls.flat().join("");
    expect(errorCalls).toContain("not configured");
    expect(listObjectsSpy).not.toHaveBeenCalled();
  });

  it("lists objects when config and env credentials are provided", async () => {
    const t = createTestProject();
    mockConfigResult = VALID_CONFIG;
    setEnv(ENV_CREDS);
    logSpy = spyOn(console, "log").mockImplementation(() => {});

    await runStorageBucketsListCommand(t.root);

    expect(listObjectsSpy).toHaveBeenCalled();
    expect(listObjectsSpy.mock.calls[0][0]).toBe("test-bucket");

    const logOutput = logSpy.mock.calls.flat().join("");
    expect(logOutput).toContain("test-bucket");
    expect(logOutput).toContain("file1.txt");
    expect(logOutput).toContain("folder/file2.png");
    expect(logOutput).toContain("1 KB");
    expect(logOutput).toContain("2 KB");
    expect(logOutput).toContain("Total: 2");

    t.cleanup();
  });

  it("shows empty bucket message when bucket has no objects", async () => {
    const t = createTestProject();
    mockConfigResult = VALID_CONFIG;
    setEnv(ENV_CREDS);
    mockListObjectsResult = [];
    logSpy = spyOn(console, "log").mockImplementation(() => {});

    await runStorageBucketsListCommand(t.root);

    const logOutput = logSpy.mock.calls.flat().join("");
    expect(logOutput).toContain("empty");

    t.cleanup();
  });

  it("errors when config exists but credentials are missing from env", async () => {
    const t = createTestProject();
    mockConfigResult = VALID_CONFIG;
    // no ENV_CREDS set
    errorSpy = spyOn(console, "error").mockImplementation(() => {});

    await runStorageBucketsListCommand(t.root);

    expect(listObjectsSpy).not.toHaveBeenCalled();
    const errorOutput = errorSpy.mock.calls.flat().join("");
    expect(errorOutput).toContain("credentials");

    t.cleanup();
  });

  it("works with env-only config (getStorageConfigFromEnv path)", async () => {
    const t = createTestProject();
    mockConfigResult = null;
    setEnv({
      STORAGE_PROVIDER: "s3",
      STORAGE_BUCKET: "env-bucket",
      STORAGE_REGION: "us-west-2",
      STORAGE_ACCESS_KEY_ID: "env-ak",
      STORAGE_SECRET_ACCESS_KEY: "env-sk",
    });
    logSpy = spyOn(console, "log").mockImplementation(() => {});

    await runStorageBucketsListCommand(t.root);

    expect(listObjectsSpy).toHaveBeenCalled();
    expect(listObjectsSpy.mock.calls[0][0]).toBe("env-bucket");

    const logOutput = logSpy.mock.calls.flat().join("");
    expect(logOutput).toContain("env-bucket");

    clearEnv({
      STORAGE_PROVIDER: "",
      STORAGE_BUCKET: "",
      STORAGE_REGION: "",
      STORAGE_ACCESS_KEY_ID: "",
      STORAGE_SECRET_ACCESS_KEY: "",
    });
    t.cleanup();
  });

  it("returns null when STORAGE_BUCKET is missing from env config", async () => {
    const t = createTestProject();
    mockConfigResult = null;
    setEnv({ STORAGE_PROVIDER: "s3" });
    errorSpy = spyOn(console, "error").mockImplementation(() => {});

    await runStorageBucketsListCommand(t.root);

    const errorOutput = errorSpy.mock.calls.flat().join("");
    expect(errorOutput).toContain("not configured");
    expect(listObjectsSpy).not.toHaveBeenCalled();

    clearEnv({ STORAGE_PROVIDER: "" });
    t.cleanup();
  });

  it("handles adapter errors gracefully", async () => {
    const t = createTestProject();
    mockConfigResult = VALID_CONFIG;
    setEnv(ENV_CREDS);
    listObjectsSpy.mockImplementation(async () => {
      throw new Error("Connection refused");
    });
    errorSpy = spyOn(console, "error").mockImplementation(() => {});
    logSpy = spyOn(console, "log").mockImplementation(() => {});

    await runStorageBucketsListCommand(t.root);

    const errorOutput = errorSpy.mock.calls.flat().join("");
    expect(errorOutput).toContain("Failed to list buckets");
    expect(errorOutput).toContain("Connection refused");

    t.cleanup();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// runStorageUploadCommand
// ═══════════════════════════════════════════════════════════════════════════════
describe("runStorageUploadCommand", () => {
  let logSpy: ReturnType<typeof spyOn>;
  let errorSpy: ReturnType<typeof spyOn>;

  afterEach(() => {
    resetMocks();
    clearEnv(ENV_CREDS);
    clearEnv({ STORAGE_PROVIDER: "", STORAGE_BUCKET: "" });
    logSpy?.mockRestore();
    errorSpy?.mockRestore();
  });

  it("errors when file path is empty", async () => {
    errorSpy = spyOn(console, "error").mockImplementation(() => {});

    await runStorageUploadCommand("");

    const errorOutput = errorSpy.mock.calls.flat().join("");
    expect(errorOutput).toContain("File path is required");
    expect(uploadSpy).not.toHaveBeenCalled();
  });

  it("errors when file does not exist", async () => {
    const t = createTestProject();
    errorSpy = spyOn(console, "error").mockImplementation(() => {});

    await runStorageUploadCommand("nonexistent.txt", { projectRoot: t.root });

    const errorOutput = errorSpy.mock.calls.flat().join("");
    expect(errorOutput).toContain("File not found");
    expect(uploadSpy).not.toHaveBeenCalled();

    t.cleanup();
  });

  it("uploads file and displays details including formatBytes output", async () => {
    const t = createTestProject();
    const fileContent = "Hello, BetterBase! This is a test file for upload.";
    writeFileSync(path.join(t.root, "hello.txt"), fileContent);
    mockConfigResult = VALID_CONFIG;
    setEnv(ENV_CREDS);
    logSpy = spyOn(console, "log").mockImplementation(() => {});

    await runStorageUploadCommand("hello.txt", { projectRoot: t.root });

    expect(uploadSpy).toHaveBeenCalled();
    const uploadArgs = uploadSpy.mock.calls[0];
    expect(uploadArgs[0]).toBe("test-bucket");
    expect(uploadArgs[1]).toContain("hello.txt");
    expect(uploadArgs[3]).toEqual({ contentType: "text/plain" });

    const logOutput = logSpy.mock.calls.flat().join("");
    // formatBytes should show the file size
    expect(logOutput).toContain(`${fileContent.length}`);
    expect(logOutput).toContain("Upload complete");
    expect(logOutput).toContain("test-bucket");

    t.cleanup();
  });

  it("determines correct content type from file extension", async () => {
    const t = createTestProject();
    writeFileSync(path.join(t.root, "icon.png"), Buffer.from("fake-png"));
    writeFileSync(path.join(t.root, "data.json"), '{"ok":true}');
    writeFileSync(path.join(t.root, "page.html"), "<html></html>");
    writeFileSync(path.join(t.root, "unknown.xyz"), "???");
    mockConfigResult = VALID_CONFIG;
    setEnv(ENV_CREDS);
    logSpy = spyOn(console, "log").mockImplementation(() => {});

    // png
    await runStorageUploadCommand("icon.png", { projectRoot: t.root });
    expect(uploadSpy.mock.calls[0][3]).toEqual({ contentType: "image/png" });

    // json
    await runStorageUploadCommand("data.json", { projectRoot: t.root });
    expect(uploadSpy.mock.calls[1][3]).toEqual({ contentType: "application/json" });

    // html
    await runStorageUploadCommand("page.html", { projectRoot: t.root });
    expect(uploadSpy.mock.calls[2][3]).toEqual({ contentType: "text/html" });

    // unknown
    await runStorageUploadCommand("unknown.xyz", { projectRoot: t.root });
    expect(uploadSpy.mock.calls[3][3]).toEqual({ contentType: "application/octet-stream" });

    t.cleanup();
  });

  it("errors when storage is not configured", async () => {
    const t = createTestProject();
    writeFileSync(path.join(t.root, "data.txt"), "test");
    mockConfigResult = null;
    errorSpy = spyOn(console, "error").mockImplementation(() => {});

    await runStorageUploadCommand("data.txt", { projectRoot: t.root });

    const errorOutput = errorSpy.mock.calls.flat().join("");
    expect(errorOutput).toContain("not configured");
    expect(uploadSpy).not.toHaveBeenCalled();

    t.cleanup();
  });

  it("errors when config exists but credentials are missing", async () => {
    const t = createTestProject();
    writeFileSync(path.join(t.root, "data.txt"), "test");
    mockConfigResult = VALID_CONFIG;
    // no ENV_CREDS
    errorSpy = spyOn(console, "error").mockImplementation(() => {});

    await runStorageUploadCommand("data.txt", { projectRoot: t.root });

    const errorOutput = errorSpy.mock.calls.flat().join("");
    expect(errorOutput).toContain("credentials");
    expect(uploadSpy).not.toHaveBeenCalled();

    t.cleanup();
  });

  it("handles upload adapter errors", async () => {
    const t = createTestProject();
    writeFileSync(path.join(t.root, "data.txt"), "test");
    mockConfigResult = VALID_CONFIG;
    setEnv(ENV_CREDS);
    uploadSpy.mockImplementationOnce(async () => {
      throw new Error("Bucket not found");
    });
    errorSpy = spyOn(console, "error").mockImplementation(() => {});

    await runStorageUploadCommand("data.txt", { projectRoot: t.root });

    const errorOutput = errorSpy.mock.calls.flat().join("");
    expect(errorOutput).toContain("Upload failed");
    expect(errorOutput).toContain("Bucket not found");

    t.cleanup();
  });

  it("uses custom bucket option when provided", async () => {
    const t = createTestProject();
    writeFileSync(path.join(t.root, "data.txt"), "test");
    mockConfigResult = VALID_CONFIG;
    setEnv(ENV_CREDS);
    logSpy = spyOn(console, "log").mockImplementation(() => {});

    await runStorageUploadCommand("data.txt", {
      projectRoot: t.root,
      bucket: "custom-bucket",
    });

    expect(uploadSpy.mock.calls[0][0]).toBe("custom-bucket");

    t.cleanup();
  });

  it("uses custom remote path when provided", async () => {
    const t = createTestProject();
    writeFileSync(path.join(t.root, "data.txt"), "test");
    mockConfigResult = VALID_CONFIG;
    setEnv(ENV_CREDS);
    logSpy = spyOn(console, "log").mockImplementation(() => {});

    await runStorageUploadCommand("data.txt", {
      projectRoot: t.root,
      path: "uploads/renamed.txt",
    });

    expect(uploadSpy.mock.calls[0][1]).toBe("uploads/renamed.txt");

    t.cleanup();
  });

  it("resolves absolute file paths correctly", async () => {
    const t = createTestProject();
    const absPath = path.join(t.root, "absolute.txt");
    writeFileSync(absPath, "absolute");
    mockConfigResult = VALID_CONFIG;
    setEnv(ENV_CREDS);
    logSpy = spyOn(console, "log").mockImplementation(() => {});

    await runStorageUploadCommand(absPath, { projectRoot: "/some/other/dir" });

    expect(uploadSpy).toHaveBeenCalled();

    t.cleanup();
  });
});
