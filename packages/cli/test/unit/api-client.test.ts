import { afterAll, afterEach, describe, expect, it, mock } from "bun:test";
import { apiRequest, requireAuth } from "../../src/utils/api-client";
import { clearCredentials, saveCredentials, type Credentials } from "../../src/utils/credentials";
import { existsSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const CREDENTIALS_FILE = join(homedir(), ".betterbase", "credentials.json");

function cleanupCredentialsFile() {
  try {
    if (existsSync(CREDENTIALS_FILE)) {
      rmSync(CREDENTIALS_FILE);
    }
  } catch { /* ignore */ }
}

describe("api-client", () => {
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
      globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
        const headers = init?.headers as Record<string, string> | undefined;
        expect(headers?.Authorization).toBe("Bearer valid_token");
        return new Response(JSON.stringify(fakeResponse), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      });

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
      globalThis.fetch = mock(async () => {
        return new Response(JSON.stringify({ error: "Not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      });

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
      globalThis.fetch = mock(async () => {
        return new Response(JSON.stringify({ message: "Server error" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      });

      try {
        await expect(apiRequest("/test/path")).rejects.toThrow("HTTP 500");
      } finally {
        globalThis.fetch = origFetch;
      }
    });
  });
});
