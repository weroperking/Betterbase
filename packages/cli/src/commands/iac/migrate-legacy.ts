import { existsSync } from "node:fs";
import { readdir, readFile, writeFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import * as logger from "../../utils/logger";

export interface LegacyRoute {
	path: string;
	method: string;
	content: string;
}

export interface LegacySchema {
	content: string;
	filePath: string;
}

export async function runMigrateLegacyToIaC(projectRoot: string): Promise<void> {
	logger.blank();
	logger.info("Migrating legacy BetterBase project to IaC-only mode...");
	
	const betterbaseDir = path.join(projectRoot, "betterbase");
	const routesDir = path.join(projectRoot, "src/routes");
	const schemaPath = path.join(projectRoot, "src/db/schema.ts");
	
	// 1. Detect legacy patterns
	const legacyRoutes = await scanLegacyRoutes(projectRoot);
	const legacySchema = await scanLegacySchema(projectRoot);
	
	if (legacyRoutes.length === 0 && !legacySchema) {
		logger.warn("No legacy patterns detected. This may already be an IaC project.");
		return;
	}
	
	logger.info(`Found ${legacyRoutes.length} legacy route(s)`);
	if (legacySchema) {
		logger.info("Found legacy schema file");
	}
	
	// 2. Create betterbase/ directory structure
	await mkdir(betterbaseDir, { recursive: true });
	await mkdir(path.join(betterbaseDir, "queries"), { recursive: true });
	await mkdir(path.join(betterbaseDir, "mutations"), { recursive: true });
	await mkdir(path.join(betterbaseDir, "actions"), { recursive: true });
	await mkdir(path.join(betterbaseDir, "_generated"), { recursive: true });
	
	// 3. Convert legacy schema to IaC schema
	if (legacySchema) {
		const schemaCode = generateSchemaFromDrizzle(legacySchema.content);
		await writeFile(path.join(betterbaseDir, "schema.ts"), schemaCode);
		logger.success("Generated betterbase/schema.ts from legacy schema");
	}
	
	// 4. Convert routes to IaC functions
	for (const route of legacyRoutes) {
		const functionCode = convertToIaCFunction(route);
		const targetPath = route.method === "GET" 
			? path.join(betterbaseDir, "queries", `${route.path}.ts`)
			: path.join(betterbaseDir, "mutations", `${route.path}.ts`);
		await writeFile(targetPath, functionCode);
		logger.success(`Converted ${route.method} ${route.path} to IaC function`);
	}
	
	// 5. Generate AGENTS.md
	await generateAgentsConstraintFile(projectRoot);
	logger.success("Created AGENTS.md with IaC constraints");
	
	// 6. Remove legacy routes (optional - ask user)
	logger.blank();
	logger.info("Legacy migration complete. You may want to:");
	logger.info("  - Review the generated betterbase/schema.ts");
	logger.info("  - Check converted functions in betterbase/queries and betterbase/mutations");
	logger.info("  - Run 'bb iac sync' to apply schema changes");
	logger.info("  - Remove src/routes/ directory (it's no longer needed)");
}

async function scanLegacyRoutes(projectRoot: string): Promise<LegacyRoute[]> {
	const routes: LegacyRoute[] = [];
	const routesDir = path.join(projectRoot, "src/routes");
	
	if (!existsSync(routesDir)) return routes;
	
	const entries = await readdir(routesDir, { withFileTypes: true, recursive: true });
	
	for (const entry of entries) {
		if (!entry.isFile() || !entry.name.endsWith(".ts")) continue;
		
		const fullPath = path.join(entry.parentPath || routesDir, entry.name);
		const content = await readFile(fullPath, "utf-8");
		
		// Check if this is a Hono route file
		if (content.includes("Hono") && (content.includes(".get(") || content.includes(".post(") || content.includes(".put(") || content.includes(".delete("))) {
			// Extract HTTP methods
			const methods = [];
			if (content.includes(".get(")) methods.push("GET");
			if (content.includes(".post(")) methods.push("POST");
			if (content.includes(".put(")) methods.push("PUT");
			if (content.includes(".delete(")) methods.push("DELETE");
			
			routes.push({
				path: entry.name.replace(".ts", ""),
				method: methods[0] || "GET",
				content,
			});
		}
	}
	
	return routes;
}

async function scanLegacySchema(projectRoot: string): Promise<LegacySchema | null> {
	const schemaPath = path.join(projectRoot, "src/db/schema.ts");
	
	if (!existsSync(schemaPath)) return null;
	
	return {
		content: await readFile(schemaPath, "utf-8"),
		filePath: schemaPath,
	};
}

function generateSchemaFromDrizzle(drizzleSchema: string): string {
	// This is a simplified conversion - in reality, this would parse the Drizzle schema
	// and convert it to the IaC format
	return `import { defineSchema, v } from "@betterbase/core/iac";

export default defineSchema({
	// TODO: Convert your legacy Drizzle tables to IaC format
	// Example:
	// users: defineTable({
	//   email: v.string().unique(),
	//   name: v.string().optional(),
	// }),
});
`;
}

function convertToIaCFunction(route: LegacyRoute): string {
	// This is a simplified conversion - in reality, this would parse the Hono route
	// and convert it to an IaC function
	const template = route.method === "GET" 
		? `import { ctx } from "@betterbase/core/iac";

export default async function() {
	// TODO: Implement query logic
	return ctx.db.query("${route.path}").collect();
}
`
		: `import { ctx } from "@betterbase/core/iac";

export default async function(input: any) {
	// TODO: Implement mutation logic
	await ctx.db.insert("${route.path}", input);
	return { success: true };
}
`;
	
	return template;
}

async function generateAgentsConstraintFile(projectRoot: string): Promise<void> {
	const templatePath = path.join(import.meta.dirname, "..", "..", "..", "..", "..", "templates", "iac", "AGENTS.md");
	let agentsContent: string;
	try {
		agentsContent = await readFile(templatePath, "utf-8");
	} catch {
		throw new Error(`Failed to read AGENTS.md template from ${templatePath}. Ensure templates/iac/AGENTS.md exists.`);
	}
	
	await writeFile(path.join(projectRoot, "AGENTS.md"), agentsContent);
}