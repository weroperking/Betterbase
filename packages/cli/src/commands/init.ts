import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
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

/**
 * Copy the IaC template to the target directory
 */
async function copyIaCTemplate(targetDir: string, projectName: string): Promise<void> {
	const possibleTemplatePaths = [
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
			`IaC template not found. Searched:\n${possibleTemplatePaths.map((p) => `  - ${p}`).join("\n")}`
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
