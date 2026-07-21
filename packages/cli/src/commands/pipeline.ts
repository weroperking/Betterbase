import { existsSync } from "node:fs";
import path from "node:path";
import chalk from "chalk";
import * as logger from "../utils/logger";
import {
	detectCiPlatform,
	emitJson,
	ensureDir,
	readJson,
	runSubprocess,
	statePath,
	writeJson,
} from "../utils/project-state";

/**
 * `bb pipeline` — CI/CD pipeline generation, validation, and local execution.
 */

export interface PipelineOptions {
	project?: string;
	json?: boolean;
	dryRun?: boolean;
	force?: boolean;
	local?: boolean;
}

type CiPlatform = "github" | "gitlab" | "bitbucket";

interface PipelineStep {
	name: string;
	command: string;
}

interface PipelineRunRecord {
	timestamp: string;
	status: "success" | "failed";
	steps: Array<{ name: string; status: "success" | "failed" | "skipped"; durationMs: number }>;
	local: boolean;
}

const PIPELINE_STEPS: PipelineStep[] = [
	{ name: "install", command: "bun install" },
	{ name: "lint", command: "bun run lint" },
	{ name: "test", command: "bun test" },
	{ name: "iac-sync", command: "bb iac sync" },
	{ name: "deploy", command: "bb deploy --env production" },
];

const REQUIRED_STEP_NAMES = ["install", "lint", "test", "iac-sync", "deploy"];

function resolveRoot(options: PipelineOptions): string {
	return options.project ?? process.cwd();
}

function pipelineFileFor(platform: CiPlatform, projectRoot: string): string {
	switch (platform) {
		case "gitlab":
			return path.join(projectRoot, ".gitlab-ci.yml");
		case "bitbucket":
			return path.join(projectRoot, "bitbucket-pipelines.yml");
		default:
			return path.join(projectRoot, ".github", "workflows", "ci.yml");
	}
}

function githubActionsYaml(): string {
	return `name: CI
on: [push, pull_request]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - name: install
        run: bun install
      - name: lint
        run: bun run lint
      - name: test
        run: bun test --coverage
      - name: iac-sync
        run: bunx bb iac sync
  deploy:
    needs: build
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - name: deploy
        run: bunx bb deploy --env production
`;
}

function gitlabCiYaml(): string {
	return `stages:
  - install
  - lint
  - test
  - iac-sync
  - deploy

default:
  image: oven/bun:latest

install:
  stage: install
  script:
    - bun install

lint:
  stage: lint
  script:
    - bun run lint

test:
  stage: test
  script:
    - bun test

iac-sync:
  stage: iac-sync
  script:
    - bunx bb iac sync

deploy:
  stage: deploy
  only:
    - main
  script:
    - bunx bb deploy --env production
`;
}

function bitbucketYaml(): string {
	return `image: oven/bun:latest

pipelines:
  default:
    - step:
        name: install
        script:
          - bun install
    - step:
        name: lint
        script:
          - bun run lint
    - step:
        name: test
        script:
          - bun test
    - step:
        name: iac-sync
        script:
          - bunx bb iac sync
  branches:
    main:
      - step:
          name: deploy
          script:
            - bunx bb deploy --env production
`;
}

function pipelineContentFor(platform: CiPlatform): string {
	switch (platform) {
		case "gitlab":
			return gitlabCiYaml();
		case "bitbucket":
			return bitbucketYaml();
		default:
			return githubActionsYaml();
	}
}

export async function runPipelineGenerate(options: PipelineOptions): Promise<void> {
	const projectRoot = resolveRoot(options);
	const platform = detectCiPlatform(projectRoot);
	const target = pipelineFileFor(platform, projectRoot);
	const content = pipelineContentFor(platform);

	if (options.dryRun) {
		if (options.json) {
			emitJson({ action: "generate", dryRun: true, platform, target, content });
			return;
		}
		logger.section("Pipeline Generate (dry-run)");
		logger.keyValue("Platform", platform);
		logger.keyValue("Target", path.relative(projectRoot, target));
		logger.blank();
		console.log(chalk.dim(content));
		return;
	}

	if (existsSync(target) && !options.force) {
		if (options.json) {
			emitJson({ action: "generate", written: false, reason: "exists", target });
			return;
		}
		logger.warn(`Pipeline file already exists: ${path.relative(projectRoot, target)}`);
		logger.info("Use --force to overwrite.");
		return;
	}

	await ensureDir(path.dirname(target));
	await Bun.write(target, content);

	if (options.json) {
		emitJson({ action: "generate", written: true, platform, target });
		return;
	}
	logger.success(`Generated ${platform} pipeline: ${path.relative(projectRoot, target)}`);
}

export async function runPipelineValidate(options: PipelineOptions): Promise<void> {
	const projectRoot = resolveRoot(options);
	const platform = detectCiPlatform(projectRoot);
	const target = pipelineFileFor(platform, projectRoot);

	const violations: string[] = [];
	let content = "";

	if (!existsSync(target)) {
		violations.push(`No pipeline file found at ${path.relative(projectRoot, target)}`);
	} else {
		content = await Bun.file(target).text();
		for (const step of REQUIRED_STEP_NAMES) {
			if (!content.includes(step)) {
				violations.push(`Missing required step: ${step}`);
			}
		}
	}

	const valid = violations.length === 0;

	if (options.json) {
		emitJson({ action: "validate", platform, target, valid, violations });
		if (!valid) process.exitCode = 1;
		return;
	}

	logger.section("Pipeline Validate");
	logger.keyValue("Platform", platform);
	logger.keyValue("File", path.relative(projectRoot, target));
	if (valid) {
		logger.success("Pipeline is valid — all required steps present.");
	} else {
		logger.error("Pipeline validation failed:");
		for (const v of violations) logger.error(`  - ${v}`);
		process.exitCode = 1;
	}
}

export async function runPipelineRun(options: PipelineOptions): Promise<void> {
	const projectRoot = resolveRoot(options);
	// Local, safe steps only: skip deploy/iac-sync which need external state.
	const runnable = PIPELINE_STEPS.filter((s) => s.name === "install" || s.name === "lint" || s.name === "test");

	if (options.dryRun) {
		if (options.json) {
			emitJson({ action: "run", dryRun: true, steps: runnable.map((s) => s.name) });
			return;
		}
		logger.section("Pipeline Run (dry-run)");
		for (const step of runnable) {
			console.log(`  ${chalk.cyan(logger.sym.arrow)} ${step.name}: ${chalk.dim(step.command)}`);
		}
		logger.info("Re-run without --dry-run to execute.");
		return;
	}

	if (!options.local) {
		logger.warn("Remote pipeline execution is not configured. Use --local to run steps locally.");
		if (options.json) emitJson({ action: "run", executed: false, reason: "local-required" });
		return;
	}

	logger.section("Pipeline Run (local)");
	const record: PipelineRunRecord = {
		timestamp: new Date().toISOString(),
		status: "success",
		steps: [],
		local: true,
	};

	for (const step of runnable) {
		const start = Date.now();
		let cmd = step.command.split(" ");
		if (cmd[0] === "bun") cmd[0] = process.execPath;
		const result = await runSubprocess(cmd, { cwd: projectRoot, timeoutMs: 300_000 });
		const durationMs = Date.now() - start;
		const status = result.success ? "success" : "failed";
		record.steps.push({ name: step.name, status, durationMs });

		if (result.success) {
			logger.success(`${step.name} ${chalk.dim(`(${(durationMs / 1000).toFixed(1)}s)`)}`);
		} else {
			logger.error(`${step.name} failed`);
			if (result.stderr.trim()) console.log(chalk.dim(result.stderr.trim().split("\n").slice(-10).join("\n")));
			record.status = "failed";
			break;
		}
	}

	await writeJson(statePath(projectRoot, "pipeline-state.json"), record);

	if (options.json) {
		emitJson({ action: "run", ...record });
	}
	if (record.status === "failed") process.exitCode = 1;
}

export async function runPipelineStatus(options: PipelineOptions): Promise<void> {
	const projectRoot = resolveRoot(options);
	const record = await readJson<PipelineRunRecord | null>(
		statePath(projectRoot, "pipeline-state.json"),
		null,
	);

	if (options.json) {
		emitJson({ action: "status", lastRun: record });
		return;
	}

	logger.section("Pipeline Status");
	if (!record) {
		logger.info("No local pipeline runs recorded yet. Run `bb pipeline run --local`.");
		return;
	}

	logger.keyValue("Last run", record.timestamp);
	logger.keyValue("Status", record.status === "success" ? chalk.green(record.status) : chalk.red(record.status));
	logger.keyValue("Mode", record.local ? "local" : "remote");
	logger.blank();
	for (const step of record.steps) {
		const symbol =
			step.status === "success"
				? chalk.green(logger.sym.success)
				: step.status === "failed"
					? chalk.red(logger.sym.error)
					: chalk.dim(logger.sym.dot);
		console.log(`  ${symbol} ${step.name} ${chalk.dim(`(${(step.durationMs / 1000).toFixed(1)}s)`)}`);
	}
}
