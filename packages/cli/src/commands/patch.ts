import { existsSync } from "node:fs";
import { copyFile } from "node:fs/promises";
import path from "node:path";
import chalk from "chalk";
import { z } from "zod";
import * as logger from "../utils/logger";
import {
	detectPackageManager,
	emitJson,
	ensureDir,
	fileTimestamp,
	listDir,
	readJson,
	runSubprocess,
	statePath,
	writeJson,
} from "../utils/project-state";

/**
 * `bb patch` — Security patching (check, apply, schedule, rollback).
 */

export interface PatchOptions {
	project?: string;
	json?: boolean;
	dryRun?: boolean;
	force?: boolean;
	auto?: boolean;
	schedule?: string;
}

interface Vulnerability {
	name: string;
	severity: string;
	title?: string;
}

function resolveRoot(options: PatchOptions): string {
	return options.project ?? process.cwd();
}

function backupsDir(projectRoot: string): string {
	return statePath(projectRoot, "backups");
}

function schedulePath(projectRoot: string): string {
	return statePath(projectRoot, "patch-schedule.json");
}

function patchLogPath(projectRoot: string): string {
	return statePath(projectRoot, "patch-log.json");
}

interface AuditResult {
	vulnerabilities: Vulnerability[];
	raw: string;
	toolUsed: string;
}

async function runAudit(projectRoot: string): Promise<AuditResult> {
	const pm = detectPackageManager(projectRoot);
	// bun audit --json, fallback to npm audit --json.
	let cmd: string[] = ["bun", "audit", "--json"];
	if (pm === "npm") cmd = ["npm", "audit", "--json"];

	let result = await runSubprocess(cmd, { cwd: projectRoot, timeoutMs: 120_000 });
	let toolUsed = cmd[0] as string;

	// If bun audit isn't supported, fall back to npm.
	if (!result.success && result.stderr.toLowerCase().includes("unknown command") && pm !== "npm") {
		cmd = ["npm", "audit", "--json"];
		toolUsed = "npm";
		result = await runSubprocess(cmd, { cwd: projectRoot, timeoutMs: 120_000 });
	}

	const raw = result.stdout || result.stderr;
	const vulnerabilities = parseAudit(raw);
	return { vulnerabilities, raw, toolUsed };
}

function parseAudit(raw: string): Vulnerability[] {
	const vulns: Vulnerability[] = [];
	if (!raw.trim()) return vulns;
	try {
		const parsed = JSON.parse(raw) as Record<string, unknown>;
		// npm audit v7+ shape: { vulnerabilities: { <name>: { severity, via } } }
		const vulnMap = parsed.vulnerabilities as Record<string, { severity?: string; via?: unknown }> | undefined;
		if (vulnMap && typeof vulnMap === "object") {
			for (const [name, info] of Object.entries(vulnMap)) {
				const via = Array.isArray(info.via) ? info.via.find((v) => typeof v === "object") : undefined;
				vulns.push({
					name,
					severity: info.severity ?? "unknown",
					title: (via as { title?: string } | undefined)?.title,
				});
			}
			return vulns;
		}
		// bun audit shape may be an array or advisories map.
		const advisories = parsed.advisories as Record<string, { module_name?: string; severity?: string; title?: string }> | undefined;
		if (advisories && typeof advisories === "object") {
			for (const adv of Object.values(advisories)) {
				vulns.push({
					name: adv.module_name ?? "unknown",
					severity: adv.severity ?? "unknown",
					title: adv.title,
				});
			}
		}
	} catch {
		// Non-JSON output (e.g. "found 0 vulnerabilities") — treat as clean.
	}
	return vulns;
}

export async function runPatchCheck(options: PatchOptions): Promise<void> {
	const projectRoot = resolveRoot(options);

	if (options.dryRun) {
		const pm = detectPackageManager(projectRoot);
		if (options.json) emitJson({ action: "check", dryRun: true, tool: pm === "npm" ? "npm audit" : "bun audit" });
		else logger.info(`Would run: ${pm === "npm" ? "npm audit" : "bun audit"}`);
		return;
	}

	const { vulnerabilities, toolUsed } = await runAudit(projectRoot);

	if (options.json) {
		emitJson({ action: "check", tool: toolUsed, count: vulnerabilities.length, vulnerabilities });
		if (vulnerabilities.length > 0) process.exitCode = 1;
		return;
	}

	logger.section("Vulnerability Check");
	logger.keyValue("Tool", toolUsed);
	if (vulnerabilities.length === 0) {
		logger.success("No vulnerabilities found.");
		return;
	}
	logger.warn(`${vulnerabilities.length} vulnerability(ies) found:`);
	for (const v of vulnerabilities) {
		const sev = v.severity === "critical" || v.severity === "high" ? chalk.red(v.severity) : chalk.yellow(v.severity);
		console.log(`  ${sev} ${chalk.cyan(v.name)}${v.title ? chalk.dim(` — ${v.title}`) : ""}`);
	}
	process.exitCode = 1;
}

async function backupManifests(projectRoot: string): Promise<string[]> {
	const dir = path.join(backupsDir(projectRoot), `pkg-${fileTimestamp()}`);
	await ensureDir(dir);
	const backedUp: string[] = [];
	for (const name of ["package.json", "bun.lock", "bun.lockb", "package-lock.json", "yarn.lock", "pnpm-lock.yaml"]) {
		const src = path.join(projectRoot, name);
		if (existsSync(src)) {
			await copyFile(src, path.join(dir, name));
			backedUp.push(name);
		}
	}
	return backedUp;
}

export async function runPatchApply(options: PatchOptions): Promise<void> {
	const projectRoot = resolveRoot(options);
	const pm = detectPackageManager(projectRoot);

	const { vulnerabilities } = await runAudit(projectRoot);

	if (options.dryRun) {
		const fixCmd = pm === "npm" ? "npm audit fix" : "bun update";
		if (options.json) emitJson({ action: "apply", dryRun: true, wouldFix: vulnerabilities.length, command: fixCmd });
		else {
			logger.section("Patch Apply (dry-run)");
			logger.info(`${vulnerabilities.length} vulnerability(ies) detected. Would run: ${fixCmd}`);
		}
		return;
	}

	if (vulnerabilities.length === 0) {
		if (options.json) emitJson({ action: "apply", applied: false, reason: "no-vulnerabilities" });
		else logger.success("No vulnerabilities to patch.");
		return;
	}

	// Safety: back up manifests before mutating.
	const backedUp = await backupManifests(projectRoot);

	// Only auto-apply when explicitly requested; otherwise report guidance.
	if (!options.auto && !options.force) {
		if (options.json) {
			emitJson({ action: "apply", applied: false, reason: "confirmation-required", backedUp, vulnerabilities });
		} else {
			logger.warn("Patches not applied. Re-run with --auto to apply safe fixes automatically.");
			logger.info(`Backed up: ${backedUp.join(", ")}`);
		}
		return;
	}

	const fixCmd = pm === "npm" ? ["npm", "audit", "fix"] : ["bun", "update"];
	const result = await runSubprocess(fixCmd, { cwd: projectRoot, timeoutMs: 300_000 });

	const logEntry = {
		timestamp: new Date().toISOString(),
		tool: fixCmd.join(" "),
		success: result.success,
		vulnerabilitiesBefore: vulnerabilities.length,
		backedUp,
	};
	const log = await readJson<Array<typeof logEntry>>(patchLogPath(projectRoot), []);
	log.push(logEntry);
	await writeJson(patchLogPath(projectRoot), log);

	if (options.json) {
		emitJson({ action: "apply", applied: result.success, ...logEntry });
		if (!result.success) process.exitCode = 1;
		return;
	}

	if (result.success) {
		logger.success(`Applied patches with ${fixCmd.join(" ")}.`);
		logger.info(`Backup saved. Run \`bb patch check\` to verify remaining issues.`);
	} else {
		logger.error("Patch command failed. Your manifests were backed up; use `bb patch rollback` to restore.");
		process.exitCode = 1;
	}
}

export async function runPatchSchedule(options: PatchOptions): Promise<void> {
	const projectRoot = resolveRoot(options);
	const frequency = options.schedule ?? "weekly";

	const cronMap: Record<string, string> = {
		daily: "0 3 * * *",
		weekly: "0 3 * * 0",
		monthly: "0 3 1 * *",
	};
	const cron = cronMap[frequency];
	if (!cron) {
		logger.error(`Invalid schedule: ${frequency}. Use daily, weekly, or monthly.`);
		process.exitCode = 1;
		return;
	}

	const schedule = {
		frequency,
		cron,
		auto: Boolean(options.auto),
		updatedAt: new Date().toISOString(),
	};
	await writeJson(schedulePath(projectRoot), schedule);

	if (options.json) emitJson({ action: "schedule", schedule });
	else {
		logger.success(`Scheduled ${frequency} patching (${cron}).`);
		if (schedule.auto) logger.info("Auto-apply enabled for safe patches.");
	}
}

export async function runPatchRollback(options: PatchOptions): Promise<void> {
	const projectRoot = resolveRoot(options);
	const dir = backupsDir(projectRoot);
	const backups = (await listDir(dir)).filter((f) => f.startsWith("pkg-")).sort();
	const latest = backups.at(-1);

	if (!latest) {
		if (options.json) emitJson({ action: "rollback", rolledBack: false, reason: "no-backups" });
		else logger.error("No package backups found to roll back to.");
		process.exitCode = 1;
		return;
	}

	const backupPath = path.join(dir, latest);

	if (options.dryRun) {
		if (options.json) emitJson({ action: "rollback", dryRun: true, from: latest });
		else logger.info(`Would restore manifests from ${latest}`);
		return;
	}

	const files = await listDir(backupPath);
	for (const name of files) {
		await copyFile(path.join(backupPath, name), path.join(projectRoot, name));
	}

	if (options.json) emitJson({ action: "rollback", rolledBack: true, from: latest, files });
	else {
		logger.success(`Restored ${files.length} manifest(s) from ${latest}.`);
		logger.info("Run your package manager install to sync node_modules.");
	}
}
