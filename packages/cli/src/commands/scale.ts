import chalk from "chalk";
import { z } from "zod";
import * as logger from "../utils/logger";
import { emitJson, readJson, statePath, writeJson } from "../utils/project-state";

/**
 * `bb scale` — Auto-scaling configuration and events.
 */

export interface ScaleOptions {
	project?: string;
	json?: boolean;
	set?: string;
	replicas?: string;
}

const scaleConfigSchema = z.object({
	min: z.number().int().positive(),
	max: z.number().int().positive(),
	cpu: z.number().int().min(1).max(100),
	memory: z.number().int().min(1).max(100),
	currentReplicas: z.number().int().nonnegative(),
});

type ScaleConfig = z.infer<typeof scaleConfigSchema>;

interface ScaleEvent {
	timestamp: string;
	type: "scale-up" | "scale-down" | "manual" | "config-change";
	from: number;
	to: number;
	reason: string;
}

const DEFAULT_CONFIG: ScaleConfig = {
	min: 1,
	max: 3,
	cpu: 70,
	memory: 80,
	currentReplicas: 1,
};

function resolveRoot(options: ScaleOptions): string {
	return options.project ?? process.cwd();
}

function configPath(projectRoot: string): string {
	return statePath(projectRoot, "scale.json");
}

function eventsPath(projectRoot: string): string {
	return statePath(projectRoot, "scale-events.json");
}

async function loadConfig(projectRoot: string): Promise<ScaleConfig> {
	const raw = await readJson<ScaleConfig | null>(configPath(projectRoot), null);
	if (!raw) return { ...DEFAULT_CONFIG };
	const parsed = scaleConfigSchema.safeParse(raw);
	return parsed.success ? parsed.data : { ...DEFAULT_CONFIG };
}

async function loadEvents(projectRoot: string): Promise<ScaleEvent[]> {
	return readJson<ScaleEvent[]>(eventsPath(projectRoot), []);
}

async function appendEvent(projectRoot: string, event: ScaleEvent): Promise<void> {
	const events = await loadEvents(projectRoot);
	events.push(event);
	await writeJson(eventsPath(projectRoot), events);
}

export async function runScaleStatus(options: ScaleOptions): Promise<void> {
	const projectRoot = resolveRoot(options);
	const config = await loadConfig(projectRoot);

	if (options.json) {
		emitJson({ action: "status", config });
		return;
	}

	logger.section("Scaling Status");
	logger.keyValue("Current replicas", String(config.currentReplicas));
	logger.keyValue("Min replicas", String(config.min));
	logger.keyValue("Max replicas", String(config.max));
	logger.keyValue("Target CPU", `${config.cpu}%`);
	logger.keyValue("Target memory", `${config.memory}%`);
}

const SETTABLE_KEYS = ["min", "max", "cpu", "memory", "currentReplicas"] as const;
type SettableKey = (typeof SETTABLE_KEYS)[number];

export async function runScaleConfig(options: ScaleOptions): Promise<void> {
	const projectRoot = resolveRoot(options);
	const config = await loadConfig(projectRoot);

	if (!options.set) {
		// Get mode.
		if (options.json) emitJson({ action: "config", config });
		else {
			logger.section("Scaling Config");
			for (const key of SETTABLE_KEYS) logger.keyValue(key, String(config[key]));
		}
		return;
	}

	const updates: Partial<Record<SettableKey, number>> = {};
	for (const pair of options.set.split(",")) {
		const [rawKey, rawValue] = pair.split("=").map((s) => s.trim());
		if (!rawKey || rawValue === undefined) continue;
		if (!SETTABLE_KEYS.includes(rawKey as SettableKey)) {
			logger.error(`Unknown scaling key: ${rawKey}. Valid keys: ${SETTABLE_KEYS.join(", ")}`);
			process.exitCode = 1;
			return;
		}
		const value = Number.parseInt(rawValue, 10);
		if (Number.isNaN(value)) {
			logger.error(`Invalid numeric value for ${rawKey}: ${rawValue}`);
			process.exitCode = 1;
			return;
		}
		updates[rawKey as SettableKey] = value;
	}

	const next = { ...config, ...updates };
	const parsed = scaleConfigSchema.safeParse(next);
	if (!parsed.success) {
		if (options.json) {
			emitJson({ action: "config", updated: false, errors: parsed.error.issues.map((i) => i.message) });
		} else {
			logger.error("Invalid scaling config:");
			for (const issue of parsed.error.issues) logger.error(`  - ${issue.path.join(".")}: ${issue.message}`);
		}
		process.exitCode = 1;
		return;
	}

	await writeJson(configPath(projectRoot), parsed.data);
	await appendEvent(projectRoot, {
		timestamp: new Date().toISOString(),
		type: "config-change",
		from: config.currentReplicas,
		to: parsed.data.currentReplicas,
		reason: `updated ${Object.keys(updates).join(", ")}`,
	});

	if (options.json) emitJson({ action: "config", updated: true, config: parsed.data });
	else {
		logger.success("Scaling config updated.");
		for (const key of Object.keys(updates) as SettableKey[]) logger.keyValue(key, String(parsed.data[key]));
	}
}

export async function runScaleEvents(options: ScaleOptions): Promise<void> {
	const projectRoot = resolveRoot(options);
	const events = await loadEvents(projectRoot);

	if (options.json) {
		emitJson({ action: "events", count: events.length, events });
		return;
	}

	logger.section("Scaling Events");
	if (events.length === 0) {
		logger.info("No scaling events recorded.");
		return;
	}
	for (const event of events.slice(-50)) {
		console.log(
			`  ${chalk.dim(event.timestamp)} ${chalk.cyan(event.type)} ${event.from} ${chalk.dim(logger.sym.arrow)} ${event.to} ${chalk.dim(`(${event.reason})`)}`,
		);
	}
}

export async function runScaleNow(options: ScaleOptions): Promise<void> {
	const projectRoot = resolveRoot(options);
	const config = await loadConfig(projectRoot);

	if (!options.replicas) {
		logger.error("Specify a target replica count with --replicas <n>.");
		process.exitCode = 1;
		return;
	}

	const target = Number.parseInt(options.replicas, 10);
	if (Number.isNaN(target) || target < 0) {
		logger.error(`Invalid replica count: ${options.replicas}`);
		process.exitCode = 1;
		return;
	}

	const clamped = Math.max(config.min, Math.min(config.max, target));
	const from = config.currentReplicas;
	const next = { ...config, currentReplicas: clamped };
	await writeJson(configPath(projectRoot), next);
	await appendEvent(projectRoot, {
		timestamp: new Date().toISOString(),
		type: "manual",
		from,
		to: clamped,
		reason: target === clamped ? "manual scale" : `manual scale (clamped to [${config.min}, ${config.max}])`,
	});

	if (options.json) {
		emitJson({ action: "now", from, to: clamped, requested: target });
		return;
	}

	logger.success(`Scaled from ${from} to ${clamped} replica(s).`);
	if (clamped !== target) {
		logger.warn(`Requested ${target} was clamped to the [${config.min}, ${config.max}] range.`);
	}
}
