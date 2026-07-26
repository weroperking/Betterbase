import { existsSync } from "node:fs";
import { copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import chalk from "chalk";
import { z } from "zod";
import * as logger from "../utils/logger";
import * as prompts from "../utils/prompts";

const projectNameSchema = z
	.string()
	.trim()
	.min(1)
	.regex(
		/^[a-zA-Z0-9-_]+$/,
		"Project name can only contain letters, numbers, hyphens, and underscores.",
	);

const initOptionsSchema = z.object({
	projectName: projectNameSchema.optional(),
});

export type InitCommandOptions = z.infer<typeof initOptionsSchema>;

const PACKAGES_TO_BUNDLE = ["core", "server", "client", "shared"] as const;

function getBetterbaseRoot(): string {
	let dir = import.meta.dir;
	while (dir !== path.dirname(dir)) {
		const marker = path.join(dir, "packages", "server", "package.json");
		if (existsSync(marker)) return dir;
		dir = path.dirname(dir);
	}
	return dir;
}

async function copyDirRecursive(src: string, dest: string): Promise<void> {
	const entries = await readdir(src, { withFileTypes: true });
	await mkdir(dest, { recursive: true });
	for (const entry of entries) {
		const srcPath = path.join(src, entry.name);
		const destPath = path.join(dest, entry.name);
		if (entry.isDirectory()) {
			await copyDirRecursive(srcPath, destPath);
		} else if (entry.isFile()) {
			await copyFile(srcPath, destPath);
		}
	}
}

async function bundleLocalPackages(targetDir: string): Promise<void> {
	const betterbaseRoot = getBetterbaseRoot();
	if (targetDir.startsWith(betterbaseRoot)) {
		return;
	}

	for (const pkgName of PACKAGES_TO_BUNDLE) {
		const srcDir = path.join(betterbaseRoot, "packages", pkgName);
		const destDir = path.join(targetDir, "node_modules", "@betterbase", pkgName);
		if (!existsSync(srcDir)) continue;

		await mkdir(path.dirname(destDir), { recursive: true });
		await rm(destDir, { recursive: true, force: true });
		await copyDirRecursive(srcDir, destDir);

		const innerNodeModules = path.join(destDir, "node_modules");
		if (existsSync(innerNodeModules)) {
			await rm(innerNodeModules, { recursive: true, force: true });
		}

		try {
			const pkgPath = path.join(destDir, "package.json");
			const pkg = JSON.parse(await readFile(pkgPath, "utf-8"));
			if (pkg.main?.endsWith(".ts")) {
				const distIndex = path.join(destDir, "dist", "index.js");
				if (existsSync(distIndex)) {
					pkg.main = "./dist/index.js";
					pkg.module = "./dist/index.js";
				}
			}
			await writeFile(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
		} catch {
			// ignore package.json rewrite failures
		}
	}
}

/**
 * Copy the IaC template to the target directory
 */
async function copyIaCTemplate(targetDir: string, projectName: string): Promise<void> {
	const possibleTemplatePaths = [
		path.join(import.meta.dir, "..", "templates", "iac"),
		path.join(import.meta.dir, "..", "..", "..", "..", "templates", "iac"),
		path.join(import.meta.dir, "..", "..", "..", "..", "..", "betterbase", "templates", "iac"),
		path.join(import.meta.dir, "..", "..", "..", "..", "..", "..", "betterbase", "templates", "iac"),
		path.join(import.meta.dir, "..", "..", "..", "..", "..", "..", "..", "betterbase", "templates", "iac"),
	];

	let templateDir: string | null = null;
	for (const testPath of possibleTemplatePaths) {
		if (existsSync(testPath)) {
			templateDir = testPath;
			break;
		}
	}

	if (!templateDir) {
		throw new Error(
			`IaC template not found. Searched:\n${possibleTemplatePaths.map((p) => `  - ${p}`).join("\n")}`,
		);
	}

	try {
		await mkdir(targetDir, { recursive: true });
	} catch (error) {
		const code = (error as NodeJS.ErrnoException | undefined)?.code;
		if (code === "EEXIST") {
			throw new Error(`Directory already exists. Choose another project name.`);
		}
		throw error;
	}

	const templateFiles = [
		"package.json",
		"tsconfig.json",
		"betterbase.config.ts",
		"src/index.ts",
		"src/modules/README.md",
		"src/modules/.gitkeep",
		"betterbase/schema.ts",
		"betterbase/queries/todos.ts",
		"betterbase/mutations/todos.ts",
		"betterbase/actions/.gitkeep",
		"betterbase/cron.ts",
		"AGENTS.md",
	];

	for (const file of templateFiles) {
		const srcPath = path.join(templateDir, file);
		const destPath = path.join(targetDir, file);
		const destDir = path.dirname(destPath);
		await mkdir(destDir, { recursive: true });
		try {
			let content = await readFile(srcPath);
			if (file === "AGENTS.md") {
				content = Buffer.from(
					(content as Buffer).toString().replace(/\{\{projectName\}\}/g, projectName),
				);
			}
			await writeFile(destPath, content);
		} catch (error) {
			const code = (error as NodeJS.ErrnoException | undefined)?.code;
			if (code === "ENOENT") {
				throw new Error(`Missing IaC template file: ${srcPath}`);
			}
			throw error;
		}
	}

	const pkgPath = path.join(targetDir, "package.json");
	try {
		const pkgJson = JSON.parse(await readFile(pkgPath, "utf-8"));
		pkgJson.name = projectName;
		await writeFile(pkgPath, `${JSON.stringify(pkgJson, null, 2)}\n`);
	} catch (err) {
		const code = (err as NodeJS.ErrnoException | undefined)?.code;
		if (code !== "ENOENT") {
			throw err;
		}
	}

	await writeFile(
		path.join(targetDir, ".env"),
		`# Database connection (postgres, neon, supabase, planetscale)
DATABASE_URL=postgres://user:pass@localhost:5432/mydb

# Turso-specific (uncomment if using turso)
# TURSO_URL=libsql://localhost:8080
# TURSO_AUTH_TOKEN=

# Server configuration
NODE_ENV=development
PORT=3000
`,
	);

	await writeFile(
		path.join(targetDir, ".env.example"),
		`# Database connection (postgres, neon, supabase, planetscale)
DATABASE_URL=

# Turso-specific (uncomment if using turso)
# TURSO_URL=
# TURSO_AUTH_TOKEN=

# Server configuration
NODE_ENV=development
PORT=3000
`,
	);

	await writeFile(
		path.join(targetDir, ".gitignore"),
		`node_modules
bun.lockb
.env
.env.*
!.env.example
local.db
drizzle
`,
	);

	await bundleLocalPackages(targetDir);

	logger.success("IaC template copied to " + targetDir);
}

/**
 * Run the `bb init` command.
 * IaC mode only - uses BetterBase template with betterbase/ functions.
 */
export async function runInitCommand(rawOptions: InitCommandOptions): Promise<void> {
	const options = initOptionsSchema.parse(rawOptions);
	logger.blank();
	console.log(chalk.bold("  Create a new Betterbase project"));
	logger.blank();

	let projectName: string;
	if (options.projectName) {
		projectName = projectNameSchema.parse(options.projectName);
	} else {
		const projectNameInput = await prompts.text({
			message: "What is your project name?",
			initial: "my-betterbase-app",
		});
		projectName = projectNameSchema.parse(projectNameInput);
	}
	const projectPath = path.resolve(process.cwd(), projectName);

	logger.info(`Creating BetterBase IaC project: ${projectName}`);

	try {
		const existingDir = existsSync(projectPath);
		if (existingDir) {
			const overwrite = await prompts.confirm({
				message: `Directory "${projectName}" already exists. Overwrite?`,
				default: false,
			});
			if (!overwrite) {
				logger.info("Aborted. Choose a different project name.");
				process.exit(0);
			}
			try {
				await rm(projectPath, { recursive: true, force: true });
				await mkdir(projectPath, { recursive: true });
			} catch (err) {
				logger.error(`Failed to clean directory: ${err}`);
			}
		}

		await copyIaCTemplate(projectPath, projectName);

		logger.blank();
		console.log(chalk.bold(chalk.white(`  ✦ ${projectName}`)) + chalk.dim(" initialized"));
		logger.blank();
		logger.section("Created");
		logger.tree([
			"betterbase.config.ts",
			"betterbase/schema.ts",
			"src/index.ts",
			"betterbase/queries/todos.ts",
			"betterbase/mutations/todos.ts",
			"AGENTS.md",
			chalk.dim("... and more"),
		]);
		logger.section("Next steps");
		[`cd ${chalk.cyan(projectName)}`, "bun install", "bb dev"].forEach((item, idx) => {
			console.log(`  ${chalk.dim(`${idx + 1}.`)} ${item}`);
		});
		logger.blank();
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		logger.error(`Failed to create IaC project: ${message}`);
		throw error;
	}
}
