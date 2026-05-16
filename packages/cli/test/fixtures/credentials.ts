import { join } from "node:path";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";

const BETTERBASE_DIR = join(homedir(), ".betterbase");
const CREDENTIALS_FILE = join(BETTERBASE_DIR, "credentials.json");

export interface CredentialFixture {
  token: string;
  admin_email: string;
  server_url: string;
  created_at: string;
}

export function setupCredentialsFile(
  credentials: CredentialFixture,
): () => void {
  mkdirSync(BETTERBASE_DIR, { recursive: true });
  writeFileSync(CREDENTIALS_FILE, JSON.stringify(credentials));

  return () => {
    if (existsSync(CREDENTIALS_FILE)) {
      rmSync(CREDENTIALS_FILE);
    }
  };
}

export function createValidCredentials(): CredentialFixture {
  return {
    token: `token_${randomUUID()}`,
    admin_email: "admin@test.com",
    server_url: "https://api.betterbase.io",
    created_at: new Date().toISOString(),
  };
}

export function createExpiredCredentials(): CredentialFixture {
  return {
    token: "expired_token",
    admin_email: "admin@test.com",
    server_url: "https://api.betterbase.io",
    created_at: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(),
  };
}
