import { existsSync } from "node:fs";
import path from "node:path";
import chalk from "chalk";
import { z } from "zod";
import { loadCredentials } from "../utils/credentials";
import * as logger from "../utils/logger";
import {
	emitJson,
	listDir,
	parseDuration,
	readJson,
	statePath,
	writeJson,
} from "../utils/project-state";

/**
 * `bb monitor` — Monitoring & observability (logs, metrics, alerts, status).
 *
 * Reads from local `.betterbase/` caches. When the CLI is authenticated with a
 * server, `metrics` will attempt to enrich the cache from the admin metrics
 * overview endpoint (`GET /admin/metrics/overview`), which is confirmed to
 * exist in packages/server/src/routes/admin/metrics.ts.
 */

export interface MonitorOptions {
	project?: string;
	json?: boolean;
	since?: string;
	limit?: string;
}

const alertRuleSchema = z.object({
	id: z.string(),
	name: z.string(),
	metric: z.string(),
	operator: z.enum([">", "<", ">=", "<=", "=="]),
	threshold: z.number(),
	createdAt: z.string(),
});

type AlertRule = z.infer<typeof alertRuleSchema>;

function resolveRoot(options: MonitorOptions): string {
	return options.project ?? process.cwd();
}

function logsDir(projectRoot: string): string {
	return statePath(projectRoot, "logs");
}

function metricsPath(projectRoot: string): string {
	return statePath(projectRoot, "metrics.json");
}

function alertsPath(projectRoot: string): string {
	return statePath(projectRoot, "alerts.json");
}

interface LogLine {
	timestamp: string;
	text: string;
}

function parseLogLine(line: string): LogLine {
	// Attempt to parse a leading ISO timestamp; fall back to now.
	const match = line.match(/^\[?(\d{4}-\d{2}-\d{2}T[\d:.]+Z?)\]?\s*(.*)$/);
	if (match) {
		return { timestamp: match[1] as string, text: match[2] as string };
	}
	return { timestamp: new Date(0).toISOString(), text: line };
}

export async function runMonitorLogs(options: MonitorOptions): Promise<void> {
	const projectRoot = resolveRoot(options);
	const dir = logsDir(projectRoot);
	const sinceMs = parseDuration(options.since);
	const cutoff = sinceMs !== null ? Date.now() - sinceMs : null;
	const limit = options.limit ? Number.parseInt(options.limit, 10) : 200;

	const files = (await listDir(dir)).filter((f) => f.endsWith(".log")).sort();
	const collected: LogLine[] = [];

	for (const file of files) {
		const content = await Bun.file(path.join(dir, file)).text();
		for (const raw of content.split("\n")) {
			if (!raw.trim()) continue;
			const parsed = parseLogLine(raw);
			if (cutoff !== null) {
				const ts = Date.parse(parsed.timestamp);
				if (!Number.isNaN(ts) && ts < cutoff) continue;
			}
			collected.push(parsed);
		}
	}

	const tail = collected.slice(-limit);

	if (options.json) {
		emitJson({ action: "logs", since: options.since ?? null, count: tail.length, lines: tail });
		return;
	}

	logger.section("Logs");
	if (tail.length === 0) {
		logger.info(`No logs found in ${path.relative(projectRoot, dir)}${options.since ? ` since ${options.since}` : ""}.`);
		return;
	}
	for (const line of tail) {
		console.log(`${chalk.dim(line.timestamp)} ${line.text}`);
	}
}

async function fetchServerMetrics(): Promise<Record<string, unknown> | null> {
	const creds = loadCredentials();
	if (!creds?.token || !creds.server_url) return null;
	try {
		const res = await fetch(`${creds.server_url}/admin/metrics/overview`, {
			headers: { Authorization: `Bearer ${creds.token}` },
		});
		if (!res.ok) return null;
		const body = (await res.json()) as { metrics?: Record<string, unknown> };
		return body.metrics ?? null;
	} catch {
		return null;
	}
}

export async function runMonitorMetrics(options: MonitorOptions): Promise<void> {
	const projectRoot = resolveRoot(options);
	const file = metricsPath(projectRoot);

	// Try to refresh cache from server if authenticated.
	const serverMetrics = await fetchServerMetrics();
	if (serverMetrics) {
		await writeJson(file, { source: "server", collectedAt: new Date().toISOString(), metrics: serverMetrics });
	}

	const cached = await readJson<{ source?: string; collectedAt?: string; metrics?: Record<string, unknown> } | null>(
		file,
		null,
	);

	if (!cached) {
		if (options.json) {
			emitJson({ action: "metrics", metrics: null, note: "no metrics cached" });
		} else {
			logger.section("Metrics");
			logger.info("No metrics cached. Authenticate with a server or run a build/test to populate.");
		}
		return;
	}

	if (options.json) {
		emitJson({ action: "metrics", since: options.since ?? null, ...cached });
		return;
	}

	logger.section("Metrics");
	logger.keyValue("Source", cached.source ?? "local");
	if (cached.collectedAt) logger.keyValue("Collected", cached.collectedAt);
	logger.blank();
	for (const [key, value] of Object.entries(cached.metrics ?? {})) {
		logger.keyValue(key, String(value));
	}
}

async function loadAlerts(projectRoot: string): Promise<AlertRule[]> {
	return readJson<AlertRule[]>(alertsPath(projectRoot), []);
}

export async function runMonitorAlerts(
	options: MonitorOptions & { add?: string; remove?: string },
): Promise<void> {
	const projectRoot = resolveRoot(options);
	let alerts = await loadAlerts(projectRoot);

	if (options.remove) {
		const before = alerts.length;
		alerts = alerts.filter((a) => a.id !== options.remove && a.name !== options.remove);
		await writeJson(alertsPath(projectRoot), alerts);
		if (options.json) emitJson({ action: "alerts", removed: before - alerts.length, alerts });
		else logger.success(`Removed ${before - alerts.length} alert rule(s).`);
		return;
	}

	if (options.add) {
		// Format: name:metric operator threshold  e.g. "high-cpu:cpu > 80"
		const match = options.add.match(/^([\w-]+):([\w.]+)\s*(>=|<=|==|>|<)\s*(\d+(?:\.\d+)?)$/);
		if (!match) {
			logger.error('Invalid alert format. Use: --add "name:metric > threshold" (e.g. "high-cpu:cpu > 80")');
			process.exitCode = 1;
			return;
		}
		const rule: AlertRule = {
			id: `alert_${Date.now().toString(36)}`,
			name: match[1] as string,
			metric: match[2] as string,
			operator: match[3] as AlertRule["operator"],
			threshold: Number.parseFloat(match[4] as string),
			createdAt: new Date().toISOString(),
		};
		alerts.push(rule);
		await writeJson(alertsPath(projectRoot), alerts);
		if (options.json) emitJson({ action: "alerts", added: rule, alerts });
		else logger.success(`Added alert rule: ${rule.name} (${rule.metric} ${rule.operator} ${rule.threshold})`);
		return;
	}

	if (options.json) {
		emitJson({ action: "alerts", alerts });
		return;
	}

	logger.section("Alert Rules");
	if (alerts.length === 0) {
		logger.info('No alert rules. Add one with: bb monitor alerts --add "high-cpu:cpu > 80"');
		return;
	}
	for (const rule of alerts) {
		console.log(`  ${chalk.cyan(rule.name)} ${chalk.dim("—")} ${rule.metric} ${rule.operator} ${rule.threshold}`);
	}
}

export async function runMonitorStatus(options: MonitorOptions): Promise<void> {
	const projectRoot = resolveRoot(options);

	const metrics = await readJson<{ metrics?: Record<string, unknown> } | null>(metricsPath(projectRoot), null);
	const alerts = await loadAlerts(projectRoot);
	const deployments = (await listDir(statePath(projectRoot, "deployments"))).filter((f) => f.endsWith(".json"));
	const pipeline = await readJson<{ status?: string; timestamp?: string } | null>(
		statePath(projectRoot, "pipeline-state.json"),
		null,
	);
	const infraApplied = existsSync(statePath(projectRoot, "infra-state.json"));

	const status = {
		project: path.basename(projectRoot),
		lastPipeline: pipeline ? { status: pipeline.status, at: pipeline.timestamp } : null,
		deployments: deployments.length,
		alertRules: alerts.length,
		infraApplied,
		metricsCached: metrics !== null,
	};

	if (options.json) {
		emitJson({ action: "status", ...status });
		return;
	}

	logger.section("Project Status");
	logger.keyValue("Project", status.project);
	logger.keyValue(
		"Last pipeline",
		status.lastPipeline ? `${status.lastPipeline.status} (${status.lastPipeline.at})` : "none",
	);
	logger.keyValue("Deployments", String(status.deployments));
	logger.keyValue("Alert rules", String(status.alertRules));
	logger.keyValue("Infra applied", status.infraApplied ? "yes" : "no");
	logger.keyValue("Metrics cached", status.metricsCached ? "yes" : "no");
}
