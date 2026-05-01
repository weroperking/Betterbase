import { afterAll, afterEach, describe, expect, it, mock } from "bun:test";
import { join } from "node:path";
import { homedir } from "node:os";
import { existsSync, readFileSync, rmSync } from "node:fs";
import {
	runLoginCommand,
	runApiKeyLogin,
	runLogoutCommand,
	getCredentials,
	isAuthenticated,
} from "../../src/commands/login";
import {
	DEVICE_CODE_RESPONSE,
	TOKEN_RESPONSE_PENDING,
	TOKEN_RESPONSE_SUCCESS,
	ADMIN_ME_RESPONSE,
	ADMIN_LOGIN_RESPONSE,
	ADMIN_LOGIN_ERROR,
	mockFetch,
} from "../fixtures/fetch-mock";
import {
	setupCredentialsFile,
	createValidCredentials,
	createExpiredCredentials,
} from "../fixtures/credentials";

const CREDENTIALS_FILE = join(homedir(), ".betterbase", "credentials.json");

function cleanupCredentialsFile() {
	try {
		if (existsSync(CREDENTIALS_FILE)) {
			rmSync(CREDENTIALS_FILE);
		}
	} catch {
		/* ignore */
	}
}

function mockProcessExit() {
	const origExit = process.exit;
	const exitMock = mock((code: number) => {
		throw new Error(`exit:${code}`);
	});
	process.exit = exitMock as unknown as (code?: number) => never;
	return () => {
		process.exit = origExit;
	};
}

describe("runLoginCommand", () => {
	afterEach(cleanupCredentialsFile);
	afterAll(cleanupCredentialsFile);

	it("completes device code flow and saves credentials", async () => {
		const origSetTimeout = globalThis.setTimeout;
		(globalThis as Record<string, unknown>).setTimeout = (fn: (...args: unknown[]) => void, _ms?: number, ...args: unknown[]) => {
			return origSetTimeout(fn, 1, ...args) as unknown as ReturnType<typeof setTimeout>;
		};

		let tokenCallCount = 0;
		const origFetch = globalThis.fetch;
		globalThis.fetch = (async (
			input: RequestInfo | URL,
			init?: RequestInit,
		) => {
			const url =
				typeof input === "string"
					? input
					: input instanceof URL
						? input.href
						: input.url;
			const method = init?.method ?? "GET";

			if (method === "POST" && url.includes("/device/code")) {
				return new Response(JSON.stringify(DEVICE_CODE_RESPONSE), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				});
			}
			if (method === "POST" && url.includes("/device/token")) {
				tokenCallCount++;
				if (tokenCallCount === 1) {
					return new Response(JSON.stringify(TOKEN_RESPONSE_PENDING), {
						status: 202,
						headers: { "Content-Type": "application/json" },
					});
				}
				return new Response(JSON.stringify(TOKEN_RESPONSE_SUCCESS), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				});
			}
			if (method === "GET" && url.includes("/admin/auth/me")) {
				// Verify Authorization header is present and Bearer token
				const headers = new Headers(init?.headers as HeadersInit);
				const authHeader = headers.get("authorization");
				expect(authHeader).toBeDefined();
				expect(authHeader).toMatch(/^Bearer\s+.+$/);
				return new Response(JSON.stringify(ADMIN_ME_RESPONSE), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				});
			}
			return new Response(JSON.stringify({ error: "unmocked" }), {
				status: 404,
			});
		}) as typeof globalThis.fetch;

		try {
			await runLoginCommand({ serverUrl: "https://api.betterbase.io" });

			const raw = JSON.parse(readFileSync(CREDENTIALS_FILE, "utf-8"));
			expect(raw.token).toBe("access_token_xyz789");
			expect(raw.admin_email).toBe("admin@test.com");
			expect(raw.server_url).toBe("https://api.betterbase.io");
		} finally {
			globalThis.fetch = origFetch;
			globalThis.setTimeout = origSetTimeout;
		}
	});

	it("handles network error and exits process", async () => {
		const restoreExit = mockProcessExit();
		const origFetch = globalThis.fetch;

		globalThis.fetch = (async () => {
			throw new Error("Failed to fetch: connect ECONNREFUSED");
		}) as unknown as typeof globalThis.fetch;

		try {
			await runLoginCommand();
			expect.unreachable("should have thrown exit");
		} catch (e: unknown) {
			expect((e as Error).message).toBe("exit:1");
		} finally {
			globalThis.fetch = origFetch;
			restoreExit();
		}
	});
});

describe("runApiKeyLogin", () => {
	afterEach(cleanupCredentialsFile);
	afterAll(cleanupCredentialsFile);

	it("logs in and saves credentials via POST /admin/auth/login", async () => {
		const routes = [
			{
				method: "POST",
				url: "/admin/auth/login",
				status: 200,
				body: ADMIN_LOGIN_RESPONSE,
			},
		];
		const fmock = mockFetch(routes);
		const origFetch = globalThis.fetch;
		globalThis.fetch = fmock as typeof globalThis.fetch;

		try {
			await runApiKeyLogin({
				serverUrl: "https://api.betterbase.io",
				email: "admin@test.com",
				password: "password123",
			});

			const raw = JSON.parse(readFileSync(CREDENTIALS_FILE, "utf-8"));
			expect(raw.token).toBe("api_key_token_123");
			expect(raw.admin_email).toBe("admin@test.com");
			expect(raw.server_url).toBe("https://api.betterbase.io");
		} finally {
			globalThis.fetch = origFetch;
		}
	});

	it("handles invalid credentials and exits process", async () => {
		const restoreExit = mockProcessExit();
		const routes = [
			{
				method: "POST",
				url: "/admin/auth/login",
				status: 401,
				body: ADMIN_LOGIN_ERROR,
			},
		];
		const fmock = mockFetch(routes);
		const origFetch = globalThis.fetch;
		globalThis.fetch = fmock as typeof globalThis.fetch;

		try {
			await runApiKeyLogin({
				email: "admin@test.com",
				password: "wrong-password",
			});
			expect.unreachable("should have thrown exit");
		} catch (e: unknown) {
			expect((e as Error).message).toBe("exit:1");
		} finally {
			globalThis.fetch = origFetch;
			restoreExit();
		}
	});
});

describe("runLogoutCommand", () => {
	afterEach(cleanupCredentialsFile);
	afterAll(cleanupCredentialsFile);

	it("clears credentials", async () => {
		const cleanup = setupCredentialsFile(createValidCredentials());

		try {
			await runLogoutCommand();

			const content = JSON.parse(readFileSync(CREDENTIALS_FILE, "utf-8"));
			expect(content).toEqual({});
		} finally {
			cleanup();
		}
	});
});

describe("getCredentials", () => {
	afterEach(cleanupCredentialsFile);
	afterAll(cleanupCredentialsFile);

	it("returns credentials when saved", async () => {
		const cleanup = setupCredentialsFile(createValidCredentials());

		try {
			const creds = await getCredentials();
			expect(creds).not.toBeNull();
			expect(creds!.token).toMatch(/^token_/);
			expect(creds!.admin_email).toBe("admin@test.com");
			expect(creds!.server_url).toBe("https://api.betterbase.io");
		} finally {
			cleanup();
		}
	});

	it("returns null when no credentials file exists", async () => {
		cleanupCredentialsFile();

		const creds = await getCredentials();
		expect(creds).toBeNull();
	});
});

describe("isAuthenticated", () => {
	afterEach(cleanupCredentialsFile);
	afterAll(cleanupCredentialsFile);

	it("returns true when credentials exist", async () => {
		const cleanup = setupCredentialsFile(createValidCredentials());

		try {
			const authed = await isAuthenticated();
			expect(authed).toBe(true);
		} finally {
			cleanup();
		}
	});

	it("returns false when no credentials exist", async () => {
		cleanupCredentialsFile();

		const authed = await isAuthenticated();
		expect(authed).toBe(false);
	});

	it("returns true with expired credentials (no expiry validation)", async () => {
		const cleanup = setupCredentialsFile(createExpiredCredentials());

		try {
			const authed = await isAuthenticated();
			expect(authed).toBe(true);
		} finally {
			cleanup();
		}
	});
});
