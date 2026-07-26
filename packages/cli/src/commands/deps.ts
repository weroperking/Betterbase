import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import chalk from "chalk";
import * as logger from "../utils/logger";
import { z } from "zod";

const depsInstallOptionsSchema = z.object({
	projectRoot: z.string().optional(),
	force: z.boolean().optional(),
	check: z.boolean().optional(),
	dryRun: z.boolean().optional(),
});

export type DepsInstallCommandOptions = z.infer<typeof depsInstallOptionsSchema>;

const BUN_PACKAGES = ["@betterbase/core", "@betterbase/client", "hono"];

async function getPackageJson(projectRoot: string): Promise<Record<string, any> | null> {
	const pkgPath = path.join(projectRoot, "package.json");
	if (!existsSync(pkgPath)) return null;
	const content = await readFile(pkgPath, "utf-8");
	return JSON.parse(content);
}

async function determineVersions(projectRoot: string): Promise<Record<string, string>> {
	const versions: Record<string, string> = {};

	for (const pkg of BUN_PACKAGES) {
		const candidatePaths = [
			path.join(projectRoot, "node_modules", pkg, "package.json"),
			path.join(projectRoot, "..", "..", "packages", pkg.replace("@betterbase/", ""), "package.json"),
			path.join(projectRoot, "..", "packages", pkg.replace("@betterbase/", ""), "package.json"),
		];

		for (const candidate of candidatePaths) {
			if (existsSync(candidate)) {
				const pkgJson = JSON.parse(await readFile(candidate, "utf-8"));
				versions[pkg] = pkgJson.version ?? "workspace:*";
				break;
			}
		}

		if (!versions[pkg]) {
			versions[pkg] = "workspace:*";
		}
	}

	return versions;
}

function diffDependencies(
	pkg: Record<string, any>,
	versions: Record<string, string>,
	force = false,
): { changed: boolean; updates: Array<{ dep: string; oldVersion: string; newVersion: string }> } {
	const updates: Array<{ dep: string; oldVersion: string; newVersion: string }> = [];
	const deps = pkg.dependencies ?? {};

	for (const [dep, version] of Object.entries(versions)) {
		if (force || !deps[dep] || deps[dep] !== version) {
			updates.push({ dep, oldVersion: deps[dep] ?? "(missing)", newVersion: version });
		}
	}

	return { changed: updates.length > 0, updates };
}

async function hasLockfile(projectRoot: string): Promise<boolean> {
	return existsSync(path.join(projectRoot, "bun.lockb"));
}

async function runCheckMode(projectRoot: string, versions: Record<string, string>): Promise<void> {
	const lockfileOk = await hasLockfile(projectRoot);
	const pkg = await getPackageJson(projectRoot);
	const deps = pkg?.dependencies ?? {};

	logger.blank();
	console.log(chalk.bold("  bb deps install --check") + chalk.dim(" — validate lockfile consistency"));
	logger.blank();

	if (!lockfileOk) {
		logger.warn("bun.lockb: MISSING");
		console.log(chalk.dim("  Run `bun init` in your project first, then run this command again."));
	} else {
		logger.success("bun.lockb: present");
	}

	logger.blank();
	console.log(chalk.bold("  Dependency check:"));
	let allOk = lockfileOk;
	for (const [dep, version] of Object.entries(versions)) {
		const current = deps[dep];
		if (current === version) {
			console.log(chalk.dim(`    ${chalk.green("✓")} ${dep}@${version}`));
		} else {
			console.log(
				chalk.dim(`    ${chalk.red("✗")} ${dep} expected ${version}, got ${current ?? "(missing)"}`),
			);
			allOk = false;
		}
	}

	logger.blank();
	if (allOk) {
		logger.success("All checks passed.");
	} else {
		logger.warn("Some checks failed.");
	}
	logger.blank();
}

export async function runDepsInstallCommand(rawOptions: DepsInstallCommandOptions): Promise<void> {
	const options = depsInstallOptionsSchema.parse(rawOptions);
	const projectRoot = options.projectRoot ?? process.cwd();

	logger.blank();
	console.log(chalk.bold("  bb deps install") + chalk.dim(" — install project dependencies"));
	if (options.dryRun) {
		console.log(chalk.dim("  (dry-run — no files will be modified)"));
	}
	logger.blank();

	const pkgPath = path.join(projectRoot, "package.json");
	if (!existsSync(pkgPath)) {
		logger.error("No package.json found. Run bb init to create a project first.");
		process.exit(1);
	}

	const pkg = await getPackageJson(projectRoot);
	if (!pkg) {
		logger.error("Could not read package.json");
		process.exit(1);
	}

	const versions = await determineVersions(projectRoot);

	if (options.check) {
		await runCheckMode(projectRoot, versions);
		return;
	}

	const diff = diffDependencies(pkg, versions, options.force);

	if (diff.changed) {
		for (const update of diff.updates) {
			logger.info(`Set ${update.dep} to ${update.newVersion}`);
		}

		if (options.dryRun) {
			logger.blank();
			console.log(chalk.bold("  Would change:"));
			logger.blank();
			for (const update of diff.updates) {
				console.log(chalk.dim(`    ${update.dep}`));
				console.log(chalk.red(`    - ${update.oldVersion}`));
				console.log(chalk.green(`    + ${update.newVersion}`));
				logger.blank();
			}
			logger.info("No files modified, bun install not run (dry-run mode).");
			return;
		}

		await writeFile(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
	} else {
		logger.info("package.json dependencies already up to date.");
	}

	logger.blank();

	const ok = await hasLockfile(projectRoot);
	if (!ok) {
		logger.warn("No bun.lockb found. Skipping bun install.");
		console.log(chalk.dim("  Run `bun init` in your project first, then run this command again."));
		return;
	}

	logger.info("Running bun install...");

	try {
		const proc = Bun.spawn(["bun", "install"], {
			cwd: projectRoot,
			stdout: "inherit",
			stderr: "inherit",
		});
		const exitCode = await proc.exited;
		if (exitCode !== 0) {
			logger.error(`bun install failed with exit code ${exitCode}`);
			process.exitCode = exitCode;
			process.exit(exitCode);
		}
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		logger.error(`bun install failed: ${message}`);
		throw err;
	}

	logger.success("Dependencies installed.");
	logger.blank();
	logger.info("Next steps:");
	logger.info("  1. Review your package.json");
	logger.info("  2. Run bb dev to start the development server");
}
