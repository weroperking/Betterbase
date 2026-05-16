import { afterAll, afterEach, describe, expect, it, mock } from "bun:test";
import { apiRequest, requireAuth } from "../../src/utils/api-client";
import { clearCredentials, saveCredentials, type Credentials } from "../../src/utils/credentials";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Use sandboxed temp directory for credentials
const tempHomeDir = mkdtempSync(join(tmpdir(), "bb-api-client-test-"));
const CREDENTIALS_FILE = join(tempHomeDir, ".betterbase", "credentials.json");

// Save original BB_CREDENTIALS_DIR
const originalBBCredentialsDir = process.env.BB_CREDENTIALS_DIR;

function cleanupCredentialsFile() {
  	try {
  		if (existsSync(CREDENTIALS_FILE)) {
  			rmSync(CREDENTIALS_FILE);
  		}
  		rmSync(tempHomeDir, { recursive: true, force: true });
  	} catch { /* ignore */ }
  	// Restore original BB_CREDENTIALS_DIR
  	if (originalBBCredentialsDir === undefined) {
  		delete process.env.BB_CREDENTIALS_DIR;
  	} else {
  		process.env.BB_CREDENTIALS_DIR = originalBBCredentialsDir;
  	}
  }

describe("api-client", () => {
  beforeEach(() => {
    // Recreate sandbox directory for each test
    rmSync(tempHomeDir, { recursive: true, force: true });
    const newTempHomeDir = mkdtempSync(join(tmpdir(), "bb-api-client-test-"));
    process.env.BB_CREDENTIALS_DIR = join(newTempHomeDir, ".betterbase");
  });
  afterEach(cleanupCredentialsFile);
  afterAll(cleanupCredentialsFile);

  describe("requireAuth", () => {
    it("returns token and serverUrl when valid credentials exist", () => {
      const creds: Credentials = {
        token: "test_token",
        admin_email: "admin@test.com",
        server_url: "https://api.betterbase.io",
        created_at: new Date().toISOString(),
      };
      saveCredentials(creds);

      const result = requireAuth();
      expect(result.token).toBe("test_token");
      expect(result.serverUrl).toBe("https://api.betterbase.io");
    });

    it("exits with code 1 when no credentials exist", () => {
      cleanupCredentialsFile();

      const exitSpy = mock((code: number) => { throw new Error(`exit:${code}`); });
      const origExit = process.exit;
      process.exit = exitSpy as unknown as (code?: number) => never;

      try {
        requireAuth();
        expect.unreachable("should have thrown");
      } catch (e: unknown) {
        expect((e as Error).message).toContain("exit:1");
      } finally {
        process.exit = origExit;
      }
    });

    it("exits when token is empty string", () => {
      const creds: Credentials = {
        token: "",
        admin_email: "admin@test.com",
        server_url: "https://api.betterbase.io",
        created_at: new Date().toISOString(),
      };
      saveCredentials(creds);

      const exitSpy = mock((code: number) => { throw new Error(`exit:${code}`); });
      const origExit = process.exit;
      process.exit = exitSpy as unknown as (code?: number) => never;

      try {
        requireAuth();
        expect.unreachable("should have thrown");
      } catch (e: unknown) {
        expect((e as Error).message).toContain("exit:1");
      } finally {
        process.exit = origExit;
      }
    });
  });

  describe("apiRequest", () => {
    it("makes authenticated request with valid token", async () => {
      const creds: Credentials = {
        token: "valid_token",
        admin_email: "admin@test.com",
        server_url: "https://api.betterbase.io",
        created_at: new Date().toISOString(),
      };
      saveCredentials(creds);

      const fakeResponse = { data: "test_result" };
      const origFetch = globalThis.fetch;
       const mockFetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
         const headers = new Headers(init?.headers);
         expect(headers.get("Authorization")).toBe("Bearer valid_token");
         return new Response(JSON.stringify(fakeResponse), {
           status: 200,
           headers: { "Content-Type": "application/json" },
         });
       });
      (mockFetch as any).preconnect = false;
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      try {
        const result = await apiRequest("/test/path");
        expect(result).toEqual(fakeResponse);
      } finally {
        globalThis.fetch = origFetch;
      }
    });

    it("throws on non-OK response with JSON body", async () => {
      const creds: Credentials = {
        token: "valid_token",
        admin_email: "admin@test.com",
        server_url: "https://api.betterbase.io",
        created_at: new Date().toISOString(),
      };
      saveCredentials(creds);

      const origFetch = globalThis.fetch;
      const mockFetch = mock(async () => {
        return new Response(JSON.stringify({ error: "Not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      });
      (mockFetch as any).preconnect = false;
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      try {
        await expect(apiRequest("/test/path")).rejects.toThrow("Not found");
      } finally {
        globalThis.fetch = origFetch;
      }
    });

    it("throws HTTP status when non-OK response has JSON body with no error field", async () => {
      const creds: Credentials = {
        token: "valid_token",
        admin_email: "admin@test.com",
        server_url: "https://api.betterbase.io",
        created_at: new Date().toISOString(),
      };
      saveCredentials(creds);

      const origFetch = globalThis.fetch;
      const mockFetch = mock(async () => {
        return new Response(JSON.stringify({ message: "Server error" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      });
      (mockFetch as any).preconnect = false;
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      try {
        await expect(apiRequest("/test/path")).rejects.toThrow("HTTP 500");
      } finally {
        globalThis.fetch = origFetch;
      }
    });
  });
});
