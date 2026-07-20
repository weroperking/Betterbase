import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Shared helpers for reading and writing BetterBase local project state.
 *
 * All Stage 3 & 4 commands persist their operational state under a
 * `.betterbase/` directory inside the target project. This keeps the CLI
 * deterministic, idempotent, and fully functional offline (no server
 * dependency required for local operations).
 */

export const STATE_DIR = ".betterbase";

/**
 * Resolve the absolute path to the `.betterbase` state directory for a project.
 */
export function stateDir(projectRoot: string): string {
	return path.join(projectRoot, STATE_DIR);
}

/**
 * Resolve a path inside the `.betterbase` state directory.
 */
export function statePath(projectRoot: string, ...segments: string[]): string {
	return path.join(stateDir(projectRoot), ...segments);
}

/**
 * Ensure a directory exists, creating it (and parents) if required.
 */
export async function ensureDir(dir: string): Promise<void> {
	if (!existsSync(dir)) {
		await mkdir(dir, { recursive: true });
	}
}

/**
 * Read and parse a JSON state file. Returns `fallback` when the file does not
 * exist or cannot be parsed.
 */
export async function readJson<T>(filePath: string, fallback: T): Promise<T> {
	if (!existsSync(filePath)) {
		return fallback;
	}
	try {
		const raw = await readFile(filePath, "utf8");
		return JSON.parse(raw) as T;
	} catch {
		return fallback;
	}
}

/**
 * Write a JSON state file, creating the parent directory if necessary.
 */
export async function writeJson(filePath: string, data: unknown): Promise<void> {
	await ensureDir(path.dirname(filePath));
	await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

/**
 * Remove a file if it exists.
 */
export async function removeFile(filePath: string): Promise<void> {
	if (existsSync(filePath)) {
		await unlink(filePath);
	}
}

/**
 * List the files in a directory, returning an empty array when it is absent.
 */
export async function listDir(dir: string): Promise<string[]> {
	if (!existsSync(dir)) {
		return [];
	}
	return readdir(dir);
}

/**
 * Emit a value as structured JSON to stdout (used for `--json` flags).
 */
export function emitJson(value: unknown): void {
	process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

/**
 * Result of spawning a subprocess.
 */
export interface SubprocessResult {
	success: boolean;
	exitCode: number;
	stdout: string;
	stderr: string;
}

/**
 * Run a subprocess and capture its output. Never throws for a non-zero exit;
 * inspect `success`/`exitCode` instead.
 */
export async function runSubprocess(
	cmd: string[],
	opts: { cwd?: string; timeoutMs?: number } = {},
): Promise<SubprocessResult> {
	const controller = new AbortController();
	const timeout = opts.timeoutMs
		? setTimeout(() => controller.abort(), opts.timeoutMs)
		: undefined;

	try {
		const proc = Bun.spawn(cmd, {
			cwd: opts.cwd ?? process.cwd(),
			stdout: "pipe",
			stderr: "pipe",
			signal: controller.signal,
		});

		const [stdout, stderr, exitCode] = await Promise.all([
			new Response(proc.stdout).text(),
			new Response(proc.stderr).text(),
			proc.exited,
		]);

		return { success: exitCode === 0, exitCode, stdout, stderr };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return { success: false, exitCode: -1, stdout: "", stderr: message };
	} finally {
		if (timeout) clearTimeout(timeout);
	}
}

/**
 * Detect the package manager used by a project based on lockfiles.
 */
export function detectPackageManager(projectRoot: string): "bun" | "npm" | "yarn" | "pnpm" {
	if (existsSync(path.join(projectRoot, "bun.lockb")) || existsSync(path.join(projectRoot, "bun.lock"))) {
		return "bun";
	}
	if (existsSync(path.join(projectRoot, "pnpm-lock.yaml"))) return "pnpm";
	if (existsSync(path.join(projectRoot, "yarn.lock"))) return "yarn";
	if (existsSync(path.join(projectRoot, "package-lock.json"))) return "npm";
	return "bun";
}

/**
 * Detect the CI/CD platform for a project based on repository markers.
 */
export function detectCiPlatform(projectRoot: string): "github" | "gitlab" | "bitbucket" {
	if (existsSync(path.join(projectRoot, ".gitlab-ci.yml"))) return "gitlab";
	if (existsSync(path.join(projectRoot, "bitbucket-pipelines.yml"))) return "bitbucket";
	// GitLab/Bitbucket remotes are common signals even without an existing config.
	const gitConfig = path.join(projectRoot, ".git", "config");
	if (existsSync(gitConfig)) {
		try {
			const contents = require("node:fs").readFileSync(gitConfig, "utf8") as string;
			if (contents.includes("gitlab.com")) return "gitlab";
			if (contents.includes("bitbucket.org")) return "bitbucket";
		} catch {
			// ignore
		}
	}
	return "github";
}

/**
 * Parse a "since" duration string (e.g. `1h`, `30m`, `7d`) into milliseconds.
 * Returns `null` for invalid input.
 */
export function parseDuration(input: string | undefined): number | null {
	if (!input) return null;
	const match = input.trim().match(/^(\d+)\s*(s|m|h|d|w)$/i);
	if (!match) return null;
	const value = Number.parseInt(match[1] as string, 10);
	const unit = (match[2] as string).toLowerCase();
	const multipliers: Record<string, number> = {
		s: 1000,
		m: 60_000,
		h: 3_600_000,
		d: 86_400_000,
		w: 604_800_000,
	};
	return value * (multipliers[unit] ?? 0);
}

/**
 * Generate a filesystem-safe timestamp for filenames.
 */
export function fileTimestamp(date: Date = new Date()): string {
	return date.toISOString().replace(/[:.]/g, "-");
}

/**
 * Check whether a binary is available on the PATH.
 */
export async function hasBinary(name: string): Promise<boolean> {
	const result = await runSubprocess(["which", name], { timeoutMs: 5000 });
	return result.success && result.stdout.trim().length > 0;
}
