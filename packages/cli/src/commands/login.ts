import chalk from "chalk";
import { clearCredentials, loadCredentials, saveCredentials } from "../utils/credentials";
import { blank, box, error, keyValue, section, success, sym } from "../utils/logger";
import { createSpinner } from "../utils/spinner";
import { createApiClient } from "../utils/api-client";

const DEFAULT_SERVER_URL = "https://api.betterbase.io";
const POLL_INTERVAL_MS = 5000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000;

export async function runLoginCommand(opts: { serverUrl?: string } = {}) {
	const serverUrl = (opts.serverUrl ?? DEFAULT_SERVER_URL).replace(/\/$/, "");

	blank();
	section("Authorize CLI");

	// Step 1: Request device code
	let deviceCode: string;
	let userCode: string;
	let verificationUri: string;

	try {
		const res = await fetch(`${serverUrl}/device/code`, { method: "POST" });
		if (!res.ok) throw new Error(`Server returned ${res.status}`);
		const data = (await res.json()) as {
			device_code: string;
			user_code: string;
			verification_uri: string;
		};
		deviceCode = data.device_code;
		userCode = data.user_code;
		verificationUri = data.verification_uri;
	} catch (err: any) {
		const msg = err.message || "";
		if (msg.includes("connect") || msg.includes("ECONNREFUSED") || msg.includes("fetch")) {
			error(`Could not connect to ${serverUrl}. Is the server running?`);
			console.log(chalk.dim(`\n  To start a local server:`));
			console.log(chalk.dim(`    cd packages/server && bun run dev`));
			console.log(chalk.dim(`\n  Or specify a different URL:`));
			console.log(chalk.dim(`    bb login --url http://localhost:3001`));
		} else {
			error(`Could not reach server: ${msg}`);
		}
		process.exit(1);
	}

	const fullVerificationUri = `${verificationUri}?code=${userCode}`;

	keyValue("Instance", serverUrl);
	keyValue("Your code", chalk.bold(chalk.yellow(userCode)));
	blank();
	console.log(`  ${chalk.dim("Open:")} ${chalk.cyan(fullVerificationUri)}`);
	blank();

	// Try to open the browser automatically
	try {
		if (process.platform === "darwin") {
			await Bun.spawn(["open", fullVerificationUri]);
		} else if (process.platform === "win32") {
			await Bun.spawn(["cmd", "/c", "start", fullVerificationUri]);
		} else {
			await Bun.spawn(["xdg-open", fullVerificationUri]);
		}
		console.log(chalk.dim("  Browser opened. Waiting for authorization..."));
	} catch {
		console.log(chalk.dim("  Waiting for browser authorization") + chalk.dim(" (5 min timeout)..."));
	}

	// Step 2: Poll for token
	const deadline = Date.now() + POLL_TIMEOUT_MS;
	const startedAt = Date.now();
	const spinner = createSpinner("Waiting for authorization...").start();

	while (Date.now() < deadline) {
		await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
		const elapsed = Date.now() - startedAt;
		spinner.text = `Waiting for authorization ${chalk.dim(`(${Math.round(elapsed / 1000)}s)`)}`;

		const res = await fetch(`${serverUrl}/device/token`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ device_code: deviceCode }),
		});

		if (res.status === 202) continue; // authorization_pending

		if (!res.ok) {
			const body = (await res.json()) as { error?: string };
			if (body.error === "authorization_pending") continue;
			spinner.stop();
			error(`Login failed: ${body.error ?? "unknown error"}`);
			process.exit(1);
		}

		const { access_token } = (await res.json()) as { access_token: string };

		// Get admin info
		const meRes = await fetch(`${serverUrl}/admin/auth/me`, {
			headers: { Authorization: `Bearer ${access_token}` },
		});
		const { admin } = (await meRes.json()) as { admin: { email: string } };

		saveCredentials({
			token: access_token,
			admin_email: admin.email,
			server_url: serverUrl,
			created_at: new Date().toISOString(),
		});

		spinner.stopAndPersist({ symbol: chalk.green(sym.success), text: "Authorized" });
		blank();
		box("Logged in", [
			{ label: "Instance", value: serverUrl },
			{ label: "Account", value: admin.email },
		]);
		success(`Logged in as ${chalk.cyan(admin.email)}`);
		return;
	}

	spinner.stop();
	error("Login timed out. Please try again.");
	process.exit(1);
}

export async function runApiKeyLogin(opts: {
	serverUrl?: string;
	email: string;
	password: string;
}): Promise<void> {
	const serverUrl = (opts.serverUrl ?? DEFAULT_SERVER_URL).replace(/\/$/, "");

	blank();
	section("API Key Login");

	try {
		const res = await fetch(`${serverUrl}/admin/auth/login`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ email: opts.email, password: opts.password }),
		});

		if (!res.ok) {
			const err = (await res.json()) as { error?: string };
			error(`Login failed: ${err.error || res.statusText}`);
			process.exit(1);
		}

		const { token, admin } = (await res.json()) as { token: string; admin: { email: string } };

		saveCredentials({
			token,
			admin_email: admin.email,
			server_url: serverUrl,
			created_at: new Date().toISOString(),
		});

		box("Logged in", [
			{ label: "Instance", value: serverUrl },
			{ label: "Account", value: admin.email },
		]);
		success(`Logged in as ${chalk.cyan(admin.email)}`);
	} catch (err: any) {
		const msg = err.message || "";
		if (msg.includes("connect") || msg.includes("ECONNREFUSED") || msg.includes("fetch")) {
			error(`Could not connect to ${serverUrl}. Is the server running?`);
			console.log(chalk.dim(`\n  To start a local server:`));
			console.log(chalk.dim(`    cd packages/server && bun run dev`));
		} else {
			error(`Login failed: ${msg}`);
		}
		process.exit(1);
	}
}

export async function runLogoutCommand(): Promise<void> {
	clearCredentials();
	success("Logged out.");
}

export async function runHeadlessLogin(opts: {
	apiKey: string;
	serverUrl?: string;
}) {
	const apiClient = createApiClient(opts.serverUrl);

	// Validate API key with server
	const valid = await apiClient.validateApiKey(opts.apiKey);
	if (!valid) {
		throw new Error('Invalid API key');
	}

// Store credentials securely
  if (!opts.apiKey) {
    throw new Error('API key is required for headless login');
  }
  saveCredentials({
    token: opts.apiKey,
    admin_email: 'headless@betterbase.io',
    server_url: opts.serverUrl ?? "https://api.betterbase.io",
    created_at: new Date().toISOString(),
  });

	return { success: true };
}

export async function getCredentials() {
	return loadCredentials();
}

export async function isAuthenticated(): Promise<boolean> {
	const creds = await getCredentials();
	return creds !== null;
}
