import { afterAll, afterEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { mkdtempSync, tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import {
  clearCredentials,
  loadCredentials,
  saveCredentials,
  getServerUrl,
  type Credentials,
} from "../../src/utils/credentials";

// Use sandboxed temp directory for credentials tests
const tempHomeDir = mkdtempSync(join(tmpdir(), "bb-creds-test-"));
const BETTERBASE_DIR = join(tempHomeDir, ".betterbase");
const CREDENTIALS_FILE = join(BETTERBASE_DIR, "credentials.json");

function cleanupCredentialsFile() {
  try {
    if (existsSync(CREDENTIALS_FILE)) {
      rmSync(CREDENTIALS_FILE);
    }
    rmSync(tempHomeDir, { recursive: true, force: true });
  } catch { /* ignore */ }
}

describe("credentials", () => {
  afterEach(cleanupCredentialsFile);
  afterAll(cleanupCredentialsFile);

  describe("saveCredentials", () => {
    it("saves credentials to ~/.betterbase/credentials.json", () => {
      const creds: Credentials = {
        token: "test_token_123",
        admin_email: "admin@test.com",
        server_url: "https://api.betterbase.io",
        created_at: new Date().toISOString(),
      };

      saveCredentials(creds);

      expect(existsSync(CREDENTIALS_FILE)).toBe(true);
      const raw = JSON.parse(readFileSync(CREDENTIALS_FILE, "utf-8"));
      expect(raw.token).toBe("test_token_123");
      expect(raw.admin_email).toBe("admin@test.com");
      expect(raw.server_url).toBe("https://api.betterbase.io");
    });

    it("creates the directory if it does not exist", () => {
      try { rmSync(BETTERBASE_DIR, { recursive: true, force: true }); } catch { /* ignore */ }

      const creds: Credentials = {
        token: "test_token",
        admin_email: "admin@test.com",
        server_url: "https://api.betterbase.io",
        created_at: new Date().toISOString(),
      };

      saveCredentials(creds);

      expect(existsSync(CREDENTIALS_FILE)).toBe(true);
    });

    it("overwrites existing credentials", () => {
      const first: Credentials = {
        token: "first_token",
        admin_email: "first@test.com",
        server_url: "https://api.betterbase.io",
        created_at: new Date().toISOString(),
      };
      saveCredentials(first);

      const second: Credentials = {
        token: "second_token",
        admin_email: "second@test.com",
        server_url: "https://other.betterbase.io",
        created_at: new Date().toISOString(),
      };
      saveCredentials(second);

      const loaded = loadCredentials();
      expect(loaded).not.toBeNull();
      expect(loaded!.token).toBe("second_token");
    });
  });

  describe("loadCredentials", () => {
    it("returns null when no credentials file exists", () => {
      cleanupCredentialsFile();
      const creds = loadCredentials();
      expect(creds).toBeNull();
    });

    it("loads and validates valid credentials", () => {
      const expected: Credentials = {
        token: "valid_token",
        admin_email: "admin@test.com",
        server_url: "https://api.betterbase.io",
        created_at: new Date().toISOString(),
      };
      saveCredentials(expected);

      const loaded = loadCredentials();
      expect(loaded).not.toBeNull();
      expect(loaded!.token).toBe(expected.token);
      expect(loaded!.admin_email).toBe(expected.admin_email);
      expect(loaded!.server_url).toBe(expected.server_url);
    });

    it("returns null for corrupt JSON file", () => {
      mkdirSync(BETTERBASE_DIR, { recursive: true });
      writeFileSync(CREDENTIALS_FILE, "not valid json {{{");

      const creds = loadCredentials();
      expect(creds).toBeNull();
    });

    it("returns null for missing required fields (Zod validation)", () => {
      mkdirSync(BETTERBASE_DIR, { recursive: true });
      writeFileSync(CREDENTIALS_FILE, JSON.stringify({ token: "some_token" }));

      const creds = loadCredentials();
      expect(creds).toBeNull();
    });

    it("returns null for invalid email format", () => {
      mkdirSync(BETTERBASE_DIR, { recursive: true });
      writeFileSync(
        CREDENTIALS_FILE,
        JSON.stringify({
          token: "some_token",
          admin_email: "not-an-email",
          server_url: "https://api.betterbase.io",
          created_at: new Date().toISOString(),
        }),
      );

      const creds = loadCredentials();
      expect(creds).toBeNull();
    });

    it("returns null for invalid URL format", () => {
      mkdirSync(BETTERBASE_DIR, { recursive: true });
      writeFileSync(
        CREDENTIALS_FILE,
        JSON.stringify({
          token: "some_token",
          admin_email: "admin@test.com",
          server_url: "not-a-url",
          created_at: new Date().toISOString(),
        }),
      );

      const creds = loadCredentials();
      expect(creds).toBeNull();
    });
  });

  describe("clearCredentials", () => {
    it("clears the credentials file by writing empty object", () => {
      const creds: Credentials = {
        token: "some_token",
        admin_email: "admin@test.com",
        server_url: "https://api.betterbase.io",
        created_at: new Date().toISOString(),
      };
      saveCredentials(creds);

      clearCredentials();

      const content = readFileSync(CREDENTIALS_FILE, "utf-8");
      expect(JSON.parse(content)).toEqual({});
    });

    it("does not throw when no credentials file exists", () => {
      cleanupCredentialsFile();
      expect(() => clearCredentials()).not.toThrow();
    });
  });

  describe("getServerUrl", () => {
    it("returns the server URL from saved credentials", () => {
      const creds: Credentials = {
        token: "some_token",
        admin_email: "admin@test.com",
        server_url: "https://custom.betterbase.io",
        created_at: new Date().toISOString(),
      };
      saveCredentials(creds);

      const url = getServerUrl();
      expect(url).toBe("https://custom.betterbase.io");
    });

    it("falls back to default URL when no credentials exist", () => {
      cleanupCredentialsFile();

      const url = getServerUrl();
      expect(url).toBe("https://api.betterbase.io");
    });

    it("removes trailing slash from URL", () => {
      const creds: Credentials = {
        token: "some_token",
        admin_email: "admin@test.com",
        server_url: "https://custom.betterbase.io/",
        created_at: new Date().toISOString(),
      };
      saveCredentials(creds);

      const url = getServerUrl();
      expect(url).toBe("https://custom.betterbase.io");
    });
  });
});
