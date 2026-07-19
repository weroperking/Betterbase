import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { z } from "zod";

// Allow override for testing
const getCredentialsDir = () => process.env.BB_CREDENTIALS_DIR || join(homedir(), ".betterbase");
const CREDENTIALS_FILE = () => join(getCredentialsDir(), "credentials.json");

const CredentialsSchema = z.object({
	token: z.string(),
	admin_email: z.string().email(),
	server_url: z.string().url(), // ← NEW: base URL of the Betterbase server
	created_at: z.string(),
});

export type Credentials = z.infer<typeof CredentialsSchema>;

export function saveCredentials(creds: Credentials): void {
	const CREDENTIALS_DIR = getCredentialsDir();
	if (!existsSync(CREDENTIALS_DIR)) {
		mkdirSync(CREDENTIALS_DIR, { recursive: true, mode: 0o700 });
	}
	writeFileSync(CREDENTIALS_FILE(), JSON.stringify(creds, null, 2), { mode: 0o600 });
}

export function loadCredentials(): Credentials | null {
	if (!existsSync(CREDENTIALS_FILE())) return null;
	try {
		const raw = JSON.parse(readFileSync(CREDENTIALS_FILE(), "utf-8"));
		return CredentialsSchema.parse(raw);
	} catch {
		return null;
	}
}

export function clearCredentials(): void {
	if (existsSync(CREDENTIALS_FILE())) {
		writeFileSync(CREDENTIALS_FILE(), JSON.stringify({}));
	}
}

export function getServerUrl(): string {
	const creds = loadCredentials();
	let url = creds?.server_url ?? "https://api.betterbase.io";
	return url.replace(/\/+$/, ""); // Remove trailing slashes
}

// Check if user is authenticated (has valid credentials)
export async function isAuthenticated(): Promise<boolean> {
	try {
		const creds = loadCredentials();
		return !!creds?.token;
	} catch {
		return false;
	}
}