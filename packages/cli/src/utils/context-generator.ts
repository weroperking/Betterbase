import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import * as logger from "./logger";
import { type RouteInfo, RouteScanner } from "./route-scanner";
import { SchemaScanner, type TableInfo } from "./scanner";

export interface BetterBaseContext {
	version: string;
	generated_at: string;
	tables: Record<string, TableInfo>;
	routes: Record<string, RouteInfo[]>;
	rls_policies: Record<string, RLSPolicyConfig>;
	graphql_schema: string | null;
	graphql_endpoint: string;
	ai_prompt: string;
	iacFunctions?: IaCFunctionInfo[];
	hasIaCLayer?: boolean;
}

/**
 * IaC function metadata for AI context
 */
export interface IaCFunctionInfo {
	kind: string;
	path: string;
	name: string;
}

/**
 * RLS policy configuration stored in context
 */
export interface RLSPolicyConfig {
	select?: string;
	insert?: string;
	update?: string;
	delete?: string;
	using?: string;
	withCheck?: string;
}

const POLICY_FILE_PATTERN = /\.policy\.ts$/;

/**
 * Simple policy file scanner for context generation
 * Parses the policy file to extract configuration
 */
function scanRLSPolicies(projectRoot: string): Record<string, RLSPolicyConfig> {
	const policiesDir = path.join(projectRoot, "src/db/policies");
	const policies: Record<string, RLSPolicyConfig> = {};

	if (!existsSync(policiesDir)) {
		return policies;
	}

	try {
		const entries = readdirSync(policiesDir, { withFileTypes: true });

		for (const entry of entries) {
			if (!entry.isFile() || !POLICY_FILE_PATTERN.test(entry.name)) {
				continue;
			}

			const filePath = path.join(policiesDir, entry.name);
			const tableName = entry.name.replace(POLICY_FILE_PATTERN, "");

			try {
				const content = readFileSync(filePath, "utf-8");

				// Parse policy conditions from the file
				// This is a simple regex-based extraction
				const policyConfig: RLSPolicyConfig = {};

				// Extract select condition
				const selectMatch = content.match(/select:\s*"([^"]+)"/);
				if (selectMatch) {
					policyConfig.select = selectMatch[1];
				}

				// Extract insert condition
				const insertMatch = content.match(/insert:\s*"([^"]+)"/);
				if (insertMatch) {
					policyConfig.insert = insertMatch[1];
				}

				// Extract update condition
				const updateMatch = content.match(/update:\s*"([^"]+)"/);
				if (updateMatch) {
					policyConfig.update = updateMatch[1];
				}

				// Extract delete condition
				const deleteMatch = content.match(/delete:\s*"([^"]+)"/);
				if (deleteMatch) {
					policyConfig.delete = deleteMatch[1];
				}

				// Extract using clause
				const usingMatch = content.match(/using:\s*"([^"]+)"/);
				if (usingMatch) {
					policyConfig.using = usingMatch[1];
				}

				// Extract withCheck clause
				const withCheckMatch = content.match(/withCheck:\s*"([^"]+)"/);
				if (withCheckMatch) {
					policyConfig.withCheck = withCheckMatch[1];
				}

				// Only add if there's at least one condition
				if (Object.keys(policyConfig).length > 0) {
					policies[tableName] = policyConfig;
				}
			} catch (error) {
				logger.warn(`Failed to parse policy file: ${filePath}`);
			}
		}
	} catch (error) {
		// Policies directory not accessible
		logger.warn("Could not read policies directory");
	}

	return policies;
}

export class ContextGenerator {
	async generate(projectRoot: string): Promise<BetterBaseContext> {
		const schemaPath = path.join(projectRoot, "src/db/schema.ts");
		const routesPath = path.join(projectRoot, "src/routes");

		let tables: Record<string, TableInfo> = {};
		let routes: Record<string, RouteInfo[]> = {};
		let rlsPolicies: Record<string, RLSPolicyConfig> = {};
		let iacFunctions: IaCFunctionInfo[] = [];
		let hasIaCLayer = false;

		if (existsSync(schemaPath)) {
			const schemaScanner = new SchemaScanner(schemaPath);
			tables = schemaScanner.scan();
		} else {
			logger.warn(`Schema file not found; continuing with empty tables: ${schemaPath}`);
		}

		if (existsSync(routesPath)) {
			const routeScanner = new RouteScanner();
			routes = routeScanner.scan(routesPath);
		} else {
			logger.warn(`Routes directory not found; continuing with empty routes: ${routesPath}`);
		}

		// Scan for RLS policies
		rlsPolicies = scanRLSPolicies(projectRoot);

		// Check for betterbase/ directory — if present, add IaC function metadata
		const betterbaseDir = path.join(projectRoot, "betterbase");
		if (existsSync(betterbaseDir)) {
			try {
				const { discoverFunctions } = await import("@betterbase/core/iac");
				const fns = await discoverFunctions(betterbaseDir);

				iacFunctions = fns.map((f: any) => ({
					kind: f.kind,
					path: f.path,
					name: f.name,
				}));
				hasIaCLayer = true;
				logger.success(`Found ${iacFunctions.length} IaC functions in betterbase/`);
			} catch (error) {
				const msg = error instanceof Error ? error.message : String(error);
				logger.warn(`Failed to discover IaC functions: ${msg}`);
				if (msg.includes("Cannot find module") || msg.includes("ERR_MODULE_NOT_FOUND")) {
					logger.warn("Make sure @betterbase/core is installed in your project");
				}
			}
		}

		// Read GraphQL schema if it exists
		let graphqlSchema: string | null = null;
		const graphqlSchemaPath = path.join(projectRoot, "src/lib/graphql/schema.graphql");
		if (existsSync(graphqlSchemaPath)) {
			try {
				graphqlSchema = readFileSync(graphqlSchemaPath, "utf-8");
			} catch {
				logger.warn("Failed to read GraphQL schema file");
			}
		}

		const context: BetterBaseContext = {
			version: "1.0.0",
			generated_at: new Date().toISOString(),
			tables,
			routes,
			rls_policies: rlsPolicies,
			graphql_schema: graphqlSchema,
			graphql_endpoint: "/api/graphql",
			ai_prompt: this.generateAIPrompt(tables, routes, rlsPolicies, iacFunctions, hasIaCLayer),
			iacFunctions: iacFunctions.length > 0 ? iacFunctions : undefined,
			hasIaCLayer,
		};

		const outputPath = path.join(projectRoot, ".betterbase-context.json");
		writeFileSync(outputPath, `${JSON.stringify(context, null, 2)}\n`);
		logger.success(`Generated ${outputPath}`);

		return context;
	}

	private generateAIPrompt(
		tables: Record<string, TableInfo>,
		routes: Record<string, RouteInfo[]>,
		rlsPolicies: Record<string, RLSPolicyConfig>,
		iacFunctions: IaCFunctionInfo[] = [],
		hasIaCLayer = false,
	): string {
		const tableNames = Object.keys(tables);
		const routeCount = Object.values(routes).reduce((count, methods) => count + methods.length, 0);
		const policyCount = Object.keys(rlsPolicies).length;

		let prompt = `This is a BetterBase backend project with ${tableNames.length} tables, ${routeCount} API endpoints, and ${policyCount} RLS policies.\n\n`;

		// Add IaC layer information if present
		if (hasIaCLayer && iacFunctions.length > 0) {
			const queryFns = iacFunctions.filter((f) => f.kind === "query");
			const mutationFns = iacFunctions.filter((f) => f.kind === "mutation");
			const actionFns = iacFunctions.filter((f) => f.kind === "action");

			prompt += "This project uses BetterBase IaC. Server functions are in betterbase/:\n";
			if (queryFns.length > 0) {
				prompt += `- Queries (read-only): ${queryFns.map((f) => f.path).join(", ")}\n`;
			}
			if (mutationFns.length > 0) {
				prompt += `- Mutations (writes): ${mutationFns.map((f) => f.path).join(", ")}\n`;
			}
			if (actionFns.length > 0) {
				prompt += `- Actions (side-effects): ${actionFns.map((f) => f.path).join(", ")}\n`;
			}
			prompt +=
				"Data model defined in betterbase/schema.ts. Use ctx.db inside function handlers.\n\n";
		}

		prompt += "DATABASE SCHEMA:\n";
		for (const tableName of tableNames) {
			const table = tables[tableName];
			const columns = Object.keys(table.columns ?? {}).join(", ");
			prompt += `- ${tableName}: ${columns}\n`;
			if (table.relations.length > 0) {
				prompt += `  Relations: ${table.relations.join(", ")}\n`;
			}
		}

		prompt += "\nAPI ENDPOINTS:\n";
		for (const [routePath, methods] of Object.entries(routes)) {
			for (const route of methods) {
				const auth = route.requiresAuth ? " [AUTH REQUIRED]" : "";
				prompt += `- ${route.method} ${routePath}${auth}\n`;
			}
		}

		// Add RLS policies to the prompt
		if (Object.keys(rlsPolicies).length > 0) {
			prompt += "\nRLS POLICIES:\n";
			for (const [table, policy] of Object.entries(rlsPolicies)) {
				prompt += `- ${table}:\n`;
				if (policy.select) prompt += `  SELECT: ${policy.select}\n`;
				if (policy.insert) prompt += `  INSERT: ${policy.insert}\n`;
				if (policy.update) prompt += `  UPDATE: ${policy.update}\n`;
				if (policy.delete) prompt += `  DELETE: ${policy.delete}\n`;
			}
		}

		prompt += "\nWhen writing code for this project:\n";
		if (hasIaCLayer) {
			prompt += "1. Use betterbase/ functions (query/mutation/action) for API endpoints\n";
			prompt += "2. Data model is defined in betterbase/schema.ts\n";
		} else {
			prompt += "1. Always import tables from '../db/schema'\n";
			prompt += "2. Use Drizzle ORM for database queries\n";
		}
		prompt += "3. Validate inputs with Zod\n";
		prompt += "4. Return JSON responses with proper status codes\n";
		prompt += "5. RLS policies are enforced at the database level\n";

		return prompt;
	}
}
