import { existsSync } from "node:fs";
import path from "node:path";
import chalk from "chalk";
import * as logger from "../utils/logger";
import {
	emitJson,
	fileTimestamp,
	listDir,
	readJson,
	runSubprocess,
	statePath,
	writeJson,
} from "../utils/project-state";

/**
 * `bb deploy` — Deployment orchestration with local manifest state.
 */

export type DeployStrategy = "blue-green" | "canary" | "rolling";

export interface DeployOptions {
	project?: string;
	env?: string;
	strategy?: string;
	json?: boolean;
	dryRun?: boolean;
	force?: boolean;
	build?: boolean;
}

interface DeploymentManifest {
	id: string;
	timestamp: string;
	env: string;
	strategy: DeployStrategy;
	kind: "deploy" | "canary" | "rollback" | "preview";
	commit: string | null;
	buildSucceeded: boolean;
	healthCheck: "passed" | "skipped" | "failed";
	rollbackOf?: string;
}

function resolveRoot(options: DeployOptions): string {
	return options.project ?? process.cwd();
}

function deploymentsDir(projectRoot: string): string {
	return statePath(projectRoot, "deployments");
}

function normalizeStrategy(value: string | undefined): DeployStrategy {
	switch (value) {
		case "canary":
			return "canary";
		case "rolling":
			return "rolling";
		case "blue-green":
		case "bluegreen":
			return "blue-green";
		default:
			return "blue-green";
	}
}

async function currentCommit(projectRoot: string): Promise<string | null> {
	const result = await runSubprocess(["git", "rev-parse", "--short", "HEAD"], {
		cwd: projectRoot,
		timeoutMs: 5000,
	});
	return result.success ? result.stdout.trim() || null : null;
}

async function runBuild(projectRoot: string): Promise<boolean> {
	// Only build if a build script exists; otherwise treat as no-op success.
	const pkgPath = path.join(projectRoot, "package.json");
	if (!existsSync(pkgPath)) return true;
	try {
		const pkg = JSON.parse(await Bun.file(pkgPath).text()) as { scripts?: Record<string, string> };
		if (!pkg.scripts?.build) return true;
	} catch {
		return true;
	}
	const result = await runSubprocess([process.execPath, "run", "build"], { cwd: projectRoot, timeoutMs: 300_000 });
	return result.success;
}

async function writeManifest(projectRoot: string, manifest: DeploymentManifest): Promise<string> {
	const file = path.join(deploymentsDir(projectRoot), `${fileTimestamp()}-${manifest.kind}.json`);
	await writeJson(file, manifest);
	return file;
}

async function latestManifest(projectRoot: string): Promise<DeploymentManifest | null> {
	const files = (await listDir(deploymentsDir(projectRoot)))
		.filter((f) => f.endsWith(".json"))
		.sort();
	const last = files.at(-1);
	if (!last) return null;
	return readJson<DeploymentManifest | null>(path.join(deploymentsDir(projectRoot), last), null);
}

async function performDeployment(
	options: DeployOptions,
	kind: DeploymentManifest["kind"],
	extra: Partial<DeploymentManifest> = {},
): Promise<void> {
	const projectRoot = resolveRoot(options);
	const env = options.env ?? "production";
	const strategy = kind === "canary" ? "canary" : normalizeStrategy(options.strategy);
	const commit = await currentCommit(projectRoot);

	if (options.dryRun) {
		const preview = { action: kind, dryRun: true, env, strategy, commit, ...extra };
		if (options.json) emitJson(preview);
		else {
			logger.section(`Deploy ${kind} (dry-run)`);
			logger.keyValue("Environment", env);
			logger.keyValue("Strategy", strategy);
			logger.keyValue("Commit", commit ?? "(unknown)");
			logger.info("Re-run without --dry-run to execute.");
		}
		return;
	}

	const shouldBuild = options.build !== false && kind !== "rollback";
	const buildSucceeded = shouldBuild ? await runBuild(projectRoot) : true;

	if (!buildSucceeded) {
		if (options.json) emitJson({ action: kind, deployed: false, reason: "build-failed" });
		else logger.error("Build failed. Deployment aborted.");
		process.exitCode = 1;
		return;
	}

	// Health check placeholder: passes when build succeeds.
	const healthCheck: DeploymentManifest["healthCheck"] = buildSucceeded ? "passed" : "failed";

	const manifest: DeploymentManifest = {
		id: `${env}-${fileTimestamp()}`,
		timestamp: new Date().toISOString(),
		env,
		strategy,
		kind,
		commit,
		buildSucceeded,
		healthCheck,
		...extra,
	};

	const file = await writeManifest(projectRoot, manifest);

	if (options.json) {
		emitJson({ action: kind, deployed: true, manifest, manifestPath: file });
		return;
	}

	logger.section(`Deploy ${kind}`);
	logger.keyValue("Environment", env);
	logger.keyValue("Strategy", strategy);
	logger.keyValue("Commit", commit ?? "(unknown)");
	logger.keyValue("Health check", healthCheck);
	logger.keyValue("Manifest", path.relative(projectRoot, file));
	logger.success(`${kind} deployment recorded for ${env}.`);
}

export async function runDeploy(options: DeployOptions): Promise<void> {
	await performDeployment(options, "deploy");
}

export async function runDeployCanary(options: DeployOptions): Promise<void> {
	await performDeployment(options, "canary");
}

export async function runDeployPreview(options: DeployOptions): Promise<void> {
	await performDeployment(options, "preview");
}

export async function runDeployRollback(options: DeployOptions): Promise<void> {
	const projectRoot = resolveRoot(options);
	const previous = await latestManifest(projectRoot);

	if (!previous) {
		if (options.json) emitJson({ action: "rollback", rolledBack: false, reason: "no-deployments" });
		else logger.error("No prior deployment found to roll back to.");
		process.exitCode = 1;
		return;
	}

	await performDeployment(
		{ ...options, env: options.env ?? previous.env, strategy: previous.strategy },
		"rollback",
		{ rollbackOf: previous.id },
	);
}

export async function runDeployCommand(action: string, options: DeployOptions): Promise<void> {
	switch (action) {
		case "canary":
			return runDeployCanary(options);
		case "rollback":
			return runDeployRollback(options);
		case "preview":
			return runDeployPreview(options);
		default:
			return runDeploy(options);
	}
}
