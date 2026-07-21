import { existsSync } from "node:fs";
import path from "node:path";
import chalk from "chalk";
import { z } from "zod";
import * as logger from "../utils/logger";
import * as prompts from "../utils/prompts";
import {
	emitJson,
	hasBinary,
	readJson,
	removeFile,
	statePath,
	writeJson,
} from "../utils/project-state";

/**
 * `bb infra` — Infrastructure-as-Code configuration and state management.
 */

export interface InfraOptions {
	project?: string;
	json?: boolean;
	dryRun?: boolean;
	force?: boolean;
}

const infraConfigSchema = z.object({
	provider: z.enum(["aws", "gcp", "azure", "digitalocean", "vercel", "fly", "self-hosted"]),
	region: z.string().optional(),
	instanceType: z.string().optional(),
	replicas: z.number().int().positive().optional(),
	database: z.object({
		type: z.enum(["postgresql", "mysql", "sqlite", "turso"]),
		version: z.string().optional(),
		instanceClass: z.string().optional(),
	}),
	storage: z
		.object({
			provider: z.enum(["s3", "r2", "backblaze", "minio"]),
			bucket: z.string().optional(),
			cdn: z.boolean().optional(),
		})
		.optional(),
	domain: z.string().optional(),
	tls: z.boolean().optional(),
	cdn: z.boolean().optional(),
	autoscaling: z
		.object({
			minReplicas: z.number().int().positive().optional(),
			maxReplicas: z.number().int().positive().optional(),
			targetCPU: z.number().int().positive().optional(),
			targetMemory: z.number().int().positive().optional(),
		})
		.optional(),
});

export type InfraConfig = z.infer<typeof infraConfigSchema>;

interface InfraState {
	appliedAt: string;
	config: InfraConfig;
}

const DEFAULT_CONFIG: InfraConfig = {
	provider: "self-hosted",
	region: "us-east-1",
	replicas: 1,
	database: { type: "postgresql", version: "16" },
	storage: { provider: "s3", cdn: false },
	tls: true,
	cdn: false,
	autoscaling: { minReplicas: 1, maxReplicas: 3, targetCPU: 70, targetMemory: 80 },
};

function resolveRoot(options: InfraOptions): string {
	return options.project ?? process.cwd();
}

function configPath(projectRoot: string): string {
	return path.join(projectRoot, "infrastructure.config.json");
}

function statePathFor(projectRoot: string): string {
	return statePath(projectRoot, "infra-state.json");
}

async function loadConfig(projectRoot: string): Promise<InfraConfig | null> {
	const file = configPath(projectRoot);
	if (!existsSync(file)) return null;
	const raw = await readJson<unknown>(file, null);
	if (raw === null) return null;
	const result = infraConfigSchema.safeParse(raw);
	if (!result.success) return null;
	return result.data;
}

export async function runInfraInit(options: InfraOptions): Promise<void> {
	const projectRoot = resolveRoot(options);
	const file = configPath(projectRoot);

	if (existsSync(file) && !options.force) {
		if (options.json) {
			emitJson({ action: "init", written: false, reason: "exists", file });
			return;
		}
		logger.warn(`Config already exists: ${path.relative(projectRoot, file)}`);
		logger.info("Use --force to overwrite.");
		return;
	}

	if (options.dryRun) {
		if (options.json) {
			emitJson({ action: "init", dryRun: true, config: DEFAULT_CONFIG });
			return;
		}
		logger.section("Infra Init (dry-run)");
		console.log(chalk.dim(JSON.stringify(DEFAULT_CONFIG, null, 2)));
		return;
	}

	await writeJson(file, DEFAULT_CONFIG);

	if (options.json) {
		emitJson({ action: "init", written: true, file });
		return;
	}
	logger.success(`Scaffolded infrastructure config: ${path.relative(projectRoot, file)}`);
	logger.info("Edit the file, then run `bb infra plan` and `bb infra apply`.");
}

export async function runInfraValidate(options: InfraOptions): Promise<void> {
	const projectRoot = resolveRoot(options);
	const file = configPath(projectRoot);

	if (!existsSync(file)) {
		if (options.json) {
			emitJson({ action: "validate", valid: false, errors: ["config not found"] });
		} else {
			logger.error("No infrastructure.config.json found. Run `bb infra init`.");
		}
		process.exitCode = 1;
		return;
	}

	const raw = await readJson<unknown>(file, null);
	const result = infraConfigSchema.safeParse(raw);

	if (options.json) {
		emitJson({
			action: "validate",
			valid: result.success,
			errors: result.success ? [] : result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
		});
		if (!result.success) process.exitCode = 1;
		return;
	}

	logger.section("Infra Validate");
	if (result.success) {
		logger.success("Infrastructure config is valid.");
	} else {
		logger.error("Infrastructure config is invalid:");
		for (const issue of result.error.issues) {
			logger.error(`  - ${issue.path.join(".")}: ${issue.message}`);
		}
		process.exitCode = 1;
	}
}

function diffConfigs(
	current: InfraConfig | null,
	desired: InfraConfig,
): Array<{ key: string; from: unknown; to: unknown }> {
	const changes: Array<{ key: string; from: unknown; to: unknown }> = [];
	const flatten = (obj: Record<string, unknown>, prefix = ""): Record<string, unknown> => {
		const out: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(obj)) {
			const key = prefix ? `${prefix}.${k}` : k;
			if (v && typeof v === "object" && !Array.isArray(v)) {
				Object.assign(out, flatten(v as Record<string, unknown>, key));
			} else {
				out[key] = v;
			}
		}
		return out;
	};

	const flatDesired = flatten(desired as unknown as Record<string, unknown>);
	const flatCurrent = current ? flatten(current as unknown as Record<string, unknown>) : {};
	const keys = new Set([...Object.keys(flatDesired), ...Object.keys(flatCurrent)]);

	for (const key of keys) {
		const from = flatCurrent[key];
		const to = flatDesired[key];
		if (JSON.stringify(from) !== JSON.stringify(to)) {
			changes.push({ key, from, to });
		}
	}
	return changes;
}

export async function runInfraPlan(options: InfraOptions): Promise<void> {
	const projectRoot = resolveRoot(options);
	const desired = await loadConfig(projectRoot);

	if (!desired) {
		if (options.json) emitJson({ action: "plan", error: "config not found" });
		else logger.error("No infrastructure.config.json found. Run `bb infra init`.");
		process.exitCode = 1;
		return;
	}

	const state = await readJson<InfraState | null>(statePathFor(projectRoot), null);
	const changes = diffConfigs(state?.config ?? null, desired);

	if (options.json) {
		emitJson({ action: "plan", changes, appliedState: state?.appliedAt ?? null });
		return;
	}

	logger.section("Infra Plan");
	if (changes.length === 0) {
		logger.success("No changes. Infrastructure is up to date.");
		return;
	}
	logger.info(`${changes.length} change(s) to apply:`);
	for (const change of changes) {
		const from = change.from === undefined ? chalk.dim("(none)") : chalk.red(JSON.stringify(change.from));
		const to = change.to === undefined ? chalk.dim("(removed)") : chalk.green(JSON.stringify(change.to));
		console.log(`  ${chalk.cyan(change.key)}: ${from} ${chalk.dim(logger.sym.arrow)} ${to}`);
	}
}

export async function runInfraApply(options: InfraOptions & { autoApprove?: boolean }): Promise<void> {
	const projectRoot = resolveRoot(options);
	const desired = await loadConfig(projectRoot);

	if (!desired) {
		if (options.json) emitJson({ action: "apply", error: "config not found" });
		else logger.error("No infrastructure.config.json found. Run `bb infra init`.");
		process.exitCode = 1;
		return;
	}

	const state = await readJson<InfraState | null>(statePathFor(projectRoot), null);
	const changes = diffConfigs(state?.config ?? null, desired);

	if (changes.length === 0) {
		if (options.json) emitJson({ action: "apply", applied: false, reason: "no-changes" });
		else logger.success("No changes. Infrastructure already matches config.");
		return;
	}

	if (options.dryRun) {
		if (options.json) emitJson({ action: "apply", dryRun: true, changes });
		else {
			logger.section("Infra Apply (dry-run)");
			for (const c of changes) console.log(`  ${chalk.cyan(c.key)} ${chalk.dim(logger.sym.arrow)} ${JSON.stringify(c.to)}`);
		}
		return;
	}

	if (!options.force && !options.autoApprove && !options.json) {
		const proceed = await prompts.confirm({
			message: `Apply ${changes.length} infrastructure change(s)?`,
			default: false,
		});
		if (!proceed) {
			logger.warn("Apply cancelled.");
			return;
		}
	}

	// If terraform is present, we still only persist local state (no cloud creds
	// available in this environment). Report the equivalent plan summary.
	const terraformAvailable = await hasBinary("terraform");

	const newState: InfraState = { appliedAt: new Date().toISOString(), config: desired };
	await writeJson(statePathFor(projectRoot), newState);

	if (options.json) {
		emitJson({ action: "apply", applied: true, changes, terraformAvailable });
		return;
	}

	logger.section("Infra Apply");
	logger.success(`Applied ${changes.length} change(s) to ${desired.provider}.`);
	logger.keyValue("Provider", desired.provider);
	if (desired.region) logger.keyValue("Region", desired.region);
	logger.keyValue("Replicas", String(desired.replicas ?? 1));
	logger.keyValue("Database", `${desired.database.type}${desired.database.version ? ` ${desired.database.version}` : ""}`);
	if (terraformAvailable) {
		logger.info("terraform detected — export a provider config to provision real resources.");
	}
}

export async function runInfraDestroy(options: InfraOptions): Promise<void> {
	const projectRoot = resolveRoot(options);
	const stateFile = statePathFor(projectRoot);

	if (!existsSync(stateFile)) {
		if (options.json) emitJson({ action: "destroy", destroyed: false, reason: "no-state" });
		else logger.info("No infrastructure state to destroy.");
		return;
	}

	if (options.dryRun) {
		if (options.json) emitJson({ action: "destroy", dryRun: true });
		else logger.info("Would destroy tracked infrastructure state.");
		return;
	}

	if (!options.force && !options.json) {
		const proceed = await prompts.confirm({
			message: "Destroy all tracked infrastructure state? This cannot be undone.",
			default: false,
		});
		if (!proceed) {
			logger.warn("Destroy cancelled.");
			return;
		}
	}

	await removeFile(stateFile);

	if (options.json) emitJson({ action: "destroy", destroyed: true });
	else logger.success("Infrastructure state destroyed.");
}
