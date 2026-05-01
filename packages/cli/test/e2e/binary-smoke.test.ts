import { describe, expect, it } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const CLI_DIR = join(import.meta.dir, "..", "..");
const DIST_DIR = join(CLI_DIR, "dist");

function runCommand(cmd: string, args: string[] = []): { exitCode: number; stdout: string; stderr: string } {
	const result = spawnSync(cmd, args, {
		cwd: CLI_DIR,
		stdio: ["pipe", "pipe", "pipe"],
		encoding: "utf-8",
	});
	return {
		exitCode: result.status ?? 0,
		stdout: result.stdout ?? "",
		stderr: result.stderr ?? "",
	};
}

function ensureBuilt(): void {
	if (!existsSync(DIST_DIR)) {
		const build = runCommand("bun", ["run", "build"]);
		if (build.exitCode !== 0) {
			throw new Error(`Build failed:\n${build.stderr}`);
		}
	}
}

describe("binary smoke tests", () => {
	it("can build the CLI", () => {
		const result = runCommand("bun", ["run", "build"]);
		expect(result.exitCode).toBe(0);
		expect(result.stderr).not.toContain("error");
	});

	it("bb --version exits with 0 and stdout contains version", () => {
		ensureBuilt();
		const result = runCommand("bun", ["run", "dist/index.js", "--version"]);
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toMatch(/\d+\.\d+\.\d+/);
	});

	it("bb --help exits with 0 and stdout contains subcommand list", () => {
		ensureBuilt();
		const result = runCommand("bun", ["run", "dist/index.js", "--help"]);
		expect(result.exitCode).toBe(0);
		const out = result.stdout + result.stderr;
		expect(out).toContain("Commands:");
		expect(out).toContain("init");
		expect(out).toContain("dev");
		expect(out).toContain("login");
	});

	it("bb init --help exits 0 and contains usage", () => {
		ensureBuilt();
		const result = runCommand("bun", ["run", "dist/index.js", "init", "--help"]);
		expect(result.exitCode).toBe(0);
		const out = result.stdout + result.stderr;
		expect(out).toContain("Usage:");
		expect(out).toContain("init");
	});

	it("bb unknown-command exits non-zero", () => {
		ensureBuilt();
		const result = runCommand("bun", ["run", "dist/index.js", "not-a-real-command-xyz"]);
		expect(result.exitCode).not.toBe(0);
		const out = result.stdout + result.stderr;
		expect(out.length).toBeGreaterThan(0);
	});
});
