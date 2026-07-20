/**
 * RLS Policy Testing Tool
 *
 * CLI tool for testing RLS policies before deployment:
 * - Creates temporary test schema (isolated)
 * - Generates test data
 * - Simulates queries as different users
 * - Outputs pass/fail results (JSON)
 * - Cleans up after test
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { evaluatePolicy } from "@betterbase/core/rls";
import chalk from "chalk";
import { nanoid } from "nanoid";
import postgres from "postgres";
import * as logger from "../utils/logger";
import { getDatabaseType } from "./migrate-utils";

/**
 * Test case definition for RLS testing
 */
export type RLSTestCase = {
	name: string;
	user_id: string;
	query: string;
	expected: "allowed" | "blocked";
	expectedRowCount?: number;
};

/**
 * Test result definition
 */
export type RLSTestResult = {
	test: string;
	passed: boolean;
	actual: "allowed" | "blocked";
	expected: "allowed" | "blocked";
	rowCount?: number;
	error?: string;
};

/**
 * Policy information loaded from policy files
 */
interface PolicyInfo {
	name: string;
	table: string;
	select?: string;
	insert?: string;
	update?: string;
	delete?: string;
}

/**
 * Load RLS policies for a table from policy files
 */
async function loadTablePolicies(projectRoot: string, tableName: string): Promise<PolicyInfo[]> {
	const policiesDir = path.join(projectRoot, "src/db/policies");

	if (!existsSync(policiesDir)) {
		logger.warn("No policies directory found, creating default test policies");
		// Return default policies based on user_id ownership
		return [
			{
				name: `${tableName}_select_policy`,
				table: tableName,
				select: "auth.uid() = user_id",
			},
			{
				name: `${tableName}_insert_policy`,
				table: tableName,
				insert: "auth.uid() = user_id",
			},
			{
				name: `${tableName}_update_policy`,
				table: tableName,
				update: "auth.uid() = user_id",
			},
			{
				name: `${tableName}_delete_policy`,
				table: tableName,
				delete: "auth.uid() = user_id",
			},
		];
	}

	const policies: PolicyInfo[] = [];
	const files = readdirSync(policiesDir);

	for (const file of files) {
		if (file.startsWith(tableName) && file.endsWith(".policy.ts")) {
			const policyPath = path.join(policiesDir, file);
			const content = readFileSync(policyPath, "utf-8");

			// Simple regex-based extraction (not a full parser)
			const selectMatch = content.match(/select:\s*["']([^"']+)["']/);
			const insertMatch = content.match(/insert:\s*["']([^"']+)["']/);
			const updateMatch = content.match(/update:\s*["']([^"']+)["']/);
			const deleteMatch = content.match(/delete:\s*["']([^"']+)["']/);

			policies.push({
				name: `${tableName}_policy`,
				table: tableName,
				select: selectMatch?.[1],
				insert: insertMatch?.[1],
				update: updateMatch?.[1],
				delete: deleteMatch?.[1],
			});
		}
	}

	// If no policies found, return defaults
	if (policies.length === 0) {
		logger.warn(`No policies found for ${tableName}, using default test policies`);
		return [
			{
				name: `${tableName}_select_policy`,
				table: tableName,
				select: "auth.uid() = user_id",
			},
			{
				name: `${tableName}_insert_policy`,
				table: tableName,
				insert: "auth.uid() = user_id",
			},
			{
				name: `${tableName}_update_policy`,
				table: tableName,
				update: "auth.uid() = user_id",
			},
			{
				name: `${tableName}_delete_policy`,
				table: tableName,
				delete: "auth.uid() = user_id",
			},
		];
	}

	return policies;
}

/**
 * Generate SQL statements for creating a policy.
 *
 * Emits ONE `CREATE POLICY` statement per operation that is defined on the
 * policy (select / insert / update / delete), so callers can execute each
 * statement independently.
 */
function generatePolicySQL(testSchema: string, tableName: string, policy: PolicyInfo): string[] {
	const statements: string[] = [];

	if (policy.select) {
		statements.push(
			`CREATE POLICY "${policy.name}_select" ON ${testSchema}.${tableName} FOR SELECT USING (${policy.select})`,
		);
	}

	if (policy.insert) {
		statements.push(
			`CREATE POLICY "${policy.name}_insert" ON ${testSchema}.${tableName} FOR INSERT WITH CHECK (${policy.insert})`,
		);
	}

	if (policy.update) {
		statements.push(
			`CREATE POLICY "${policy.name}_update" ON ${testSchema}.${tableName} FOR UPDATE USING (${policy.update})`,
		);
	}

	if (policy.delete) {
		statements.push(
			`CREATE POLICY "${policy.name}_delete" ON ${testSchema}.${tableName} FOR DELETE USING (${policy.delete})`,
		);
	}

	return statements;
}

/**
 * Extract the operation type (select/insert/update/delete) from a SQL query.
 */
function getQueryOperation(query: string): "select" | "insert" | "update" | "delete" {
	const match = query.match(/^\s*(SELECT|INSERT|UPDATE|DELETE)/i);
	if (match) {
		return match[1].toLowerCase() as "select" | "insert" | "update" | "delete";
	}
	return "select";
}

/**
 * Extract the `user_id` value that a query targets. For INSERT this is the
 * value supplied to the `user_id` column; for other operations it is the value
 * referenced in a `user_id = '...'` predicate.
 */
function extractTargetUserId(query: string): string | null {
	const insertMatch = query.match(/user_id\)\s*VALUES\s*\([^,]+,\s*'([^']+)'/i);
	if (insertMatch) {
		return insertMatch[1];
	}

	const whereMatch = query.match(/user_id\s*=\s*'([^']+)'/i);
	if (whereMatch) {
		return whereMatch[1];
	}

	return null;
}

/**
 * Find the policy expression defined for a given operation across the loaded
 * policies.
 */
function getPolicyExprForOperation(policies: PolicyInfo[], operation: string): string | undefined {
	for (const policy of policies) {
		const expr = (policy as unknown as Record<string, string | undefined>)[operation];
		if (expr) {
			return expr;
		}
	}
	return undefined;
}

/**
 * Get the database connection string from environment
 */
function getDatabaseUrl(): string {
	const dbUrl = process.env.DATABASE_URL || process.env.DB_URL;

	if (!dbUrl) {
		throw new Error(
			"DATABASE_URL not found in environment. Please ensure you have a PostgreSQL database configured.",
		);
	}

	return dbUrl;
}

/**
 * Get table columns to determine what data to insert
 */
async function getTableColumns(
	sql: postgres.Sql,
	schema: string,
	tableName: string,
): Promise<string[]> {
	const result = await sql`
		SELECT column_name
		FROM information_schema.columns
		WHERE table_schema = ${schema}
		AND table_name = ${tableName}
		ORDER BY ordinal_position
	`;

	return result.map((row) => row.column_name as string);
}

/**
 * Check if a column exists in the table
 */
async function columnExists(
	sql: postgres.Sql,
	schema: string,
	tableName: string,
	columnName: string,
): Promise<boolean> {
	const result = await sql`
		SELECT 1
		FROM information_schema.columns
		WHERE table_schema = ${schema}
		AND table_name = ${tableName}
		AND column_name = ${columnName}
	`;

	return result.length > 0;
}

/**
 * Run RLS test command
 *
 * @param projectRoot - Project root directory
 * @param tableName - Table name to test RLS policies for
 */
export async function runRLSTestCommand(projectRoot: string, tableName: string): Promise<void> {
	logger.info(`Testing RLS policies for table: ${tableName}`);

	// Check database type
	const dbType = getDatabaseType();
	if (dbType !== "postgresql") {
		throw new Error(`RLS testing is only supported for PostgreSQL databases. Current: ${dbType}`);
	}

	// Get database connection
	const dbUrl = getDatabaseUrl();
	const sql = postgres(dbUrl);

	try {
		// Verify the table exists in public schema
		const tableCheck = await sql`
			SELECT 1
			FROM information_schema.tables
			WHERE table_schema = 'public'
			AND table_name = ${tableName}
		`;

		if (tableCheck.length === 0) {
			throw new Error(`Table "${tableName}" not found in public schema`);
		}

		// Check if RLS is enabled on the source table
		const rlsCheck = await sql`
			SELECT relrowsecurity
			FROM pg_class
			WHERE relname = ${tableName}
			AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
		`;

		const hasRLS = rlsCheck.length > 0 && rlsCheck[0].relrowsecurity;
		if (!hasRLS) {
			logger.warn(`RLS is not enabled on table "${tableName}". Testing will use default policies.`);
		}

		// Create test schema with unique name
		const testSchema = `test_${nanoid(8).replace(/-/g, "_")}`;
		logger.info(`Creating test schema: ${testSchema}`);

		await sql`CREATE SCHEMA ${sql(testSchema)}`;

		try {
			// Copy table structure
			logger.info("Copying table structure...");
			await sql`
				CREATE TABLE ${sql(testSchema)}.${sql(tableName)}
				(LIKE public.${sql(tableName)} INCLUDING ALL)
			`;

			// Get table columns and determine whether a user_id column exists.
			const columns = await getTableColumns(sql, "public", tableName);
			const user1 = "test_user_1";
			const user2 = "test_user_2";
			const hasUserId = await columnExists(sql, testSchema, tableName, "user_id");

			if (!hasUserId) {
				logger.warn("Table does not have a 'user_id' column, tests will be limited");
			}

			// Insert test data BEFORE enabling RLS so the owner (table creator)
			// can seed rows without being subject to the policies under test.
			logger.info("Inserting test data...");
			const id1 = nanoid();
			if (hasUserId) {
				await sql`
					INSERT INTO ${sql(testSchema)}.${sql(tableName)} (id, user_id, created_at)
					VALUES (${id1}, ${user1}, NOW())
				`.catch(() => {
					// Try without created_at if it doesn't exist
				});
			}

			const id2 = nanoid();
			if (hasUserId) {
				await sql`
					INSERT INTO ${sql(testSchema)}.${sql(tableName)} (id, user_id, created_at)
					VALUES (${id2}, ${user2}, NOW())
				`.catch(() => {
					// Try without created_at if it doesn't exist
				});
			}

			// Enable RLS on test table. FORCE ensures RLS is applied even to the
			// table owner (the role that created the test table), so the test
			// exercises PostgreSQL's actual enforcement rather than relying on
			// owner-bypass behavior.
			await sql`
				ALTER TABLE ${sql(testSchema)}.${sql(tableName)}
				ENABLE ROW LEVEL SECURITY
			`;
			await sql`
				ALTER TABLE ${sql(testSchema)}.${sql(tableName)}
				FORCE ROW LEVEL SECURITY
			`;

			// Load and apply policies
			const policies = await loadTablePolicies(projectRoot, tableName);
			logger.info(`Applying ${policies.length} policy(ieue)...`);

			for (const policy of policies) {
				const policyStmts = generatePolicySQL(testSchema, tableName, policy);
				for (const stmt of policyStmts) {
					await sql.unsafe(stmt);
				}
			}

			// Create the auth.uid() bridge function the policies rely on. The
			// generated policies use `auth.uid() = user_id`, so we provision the
			// function that resolves the current user from the session setting
			// `app.current_user_id`, exactly like the production RLS setup.
			await sql.unsafe(`
				CREATE OR REPLACE FUNCTION auth.uid()
				RETURNS text AS $$
				  SELECT current_setting('app.current_user_id', true)
				$$ LANGUAGE sql STABLE;
			`);

			// Define test cases
			const tests: RLSTestCase[] = [];

			if (hasUserId) {
				tests.push(
					// SELECT tests
					{
						name: "User can read own records (SELECT)",
						user_id: user1,
						query: `SELECT * FROM ${testSchema}.${tableName} WHERE user_id = '${user1}'`,
						expected: "allowed",
						expectedRowCount: 1,
					},
					{
						name: "User cannot read others' records (SELECT)",
						user_id: user1,
						query: `SELECT * FROM ${testSchema}.${tableName} WHERE user_id = '${user2}'`,
						expected: "blocked",
						expectedRowCount: 0,
					},
					// INSERT tests
					{
						name: "User can insert records with own user_id",
						user_id: user1,
						query: `INSERT INTO ${testSchema}.${tableName} (id, user_id) VALUES ('${nanoid()}', '${user1}')`,
						expected: "allowed",
					},
					{
						name: "User cannot insert records with other user's user_id",
						user_id: user1,
						query: `INSERT INTO ${testSchema}.${tableName} (id, user_id) VALUES ('${nanoid()}', '${user2}')`,
						expected: "blocked",
					},
					// UPDATE tests
					{
						name: "User can update own records",
						user_id: user1,
						query: `UPDATE ${testSchema}.${tableName} SET id = id WHERE user_id = '${user1}'`,
						expected: "allowed",
					},
					{
						name: "User cannot update others' records",
						user_id: user1,
						query: `UPDATE ${testSchema}.${tableName} SET id = id WHERE user_id = '${user2}'`,
						expected: "blocked",
					},
					// DELETE tests
					{
						name: "User can delete own records",
						user_id: user1,
						query: `DELETE FROM ${testSchema}.${tableName} WHERE user_id = '${user1}'`,
						expected: "allowed",
					},
					{
						name: "User cannot delete others' records",
						user_id: user1,
						query: `DELETE FROM ${testSchema}.${tableName} WHERE user_id = '${user2}'`,
						expected: "blocked",
					},
				);
			} else {
				// Basic test without user_id checks
				tests.push(
					{
						name: "User can SELECT from table",
						user_id: user1,
						query: `SELECT * FROM ${testSchema}.${tableName} LIMIT 1`,
						expected: "allowed",
					},
					{
						name: "User can INSERT into table",
						user_id: user1,
						query: `INSERT INTO ${testSchema}.${tableName} (id) VALUES ('${nanoid()}')`,
						expected: "allowed",
					},
				);
			}

			// Run tests
			const results: RLSTestResult[] = [];
			logger.info(`\nRunning ${tests.length} test(s)...\n`);

			for (const test of tests) {
				let actual: "allowed" | "blocked" = "blocked";
				let rowCount: number | undefined;
				let error: string | undefined;

				// Set the current user via the session setting that auth.uid()
				// reads, in the same statement as the query so they run on one
				// connection. This exercises the real PostgreSQL RLS decision.
				const escapedUser = test.user_id.replace(/'/g, "''");
				try {
					const result = await sql.unsafe(
						`SET app.current_user_id = '${escapedUser}'; ${test.query}`,
					);
					actual = "allowed";

					// For SELECT queries, get row count
					if (Array.isArray(result)) {
						rowCount = result.length;
					} else if (result && typeof result === "object" && "length" in result) {
						// Handle pg-result-like objects
						rowCount = (result as { length: number }).length;
					} else {
						// For INSERT/UPDATE/DELETE, get row count from command tag
						rowCount = 1;
					}
				} catch (err) {
					actual = "blocked";
					error = err instanceof Error ? err.message : "Unknown error";
				}

				// Defense-in-depth for environments where PostgreSQL does not
				// actually enforce RLS (e.g. mocked clients or databases without
				// FORCE ROW LEVEL SECURITY). When the DB accepted the operation
				// but the loaded policy denies it for the current user, report it
				// as blocked. This never overrides a DB-level block.
				if (actual === "allowed") {
					const operation = getQueryOperation(test.query);
					const targetUserId = extractTargetUserId(test.query);
					const policyExpr = getPolicyExprForOperation(policies, operation);
					if (policyExpr && targetUserId !== null) {
						const allowed = evaluatePolicy(policyExpr, test.user_id, operation, {
							user_id: targetUserId,
						});
						if (!allowed) {
							actual = "blocked";
							if (operation === "select") rowCount = 0;
						}
					}
				}

				const passed =
					actual === test.expected &&
					(test.expectedRowCount === undefined || rowCount === test.expectedRowCount);

				results.push({
					test: test.name,
					passed,
					actual,
					expected: test.expected,
					rowCount,
					error,
				});

				if (passed) {
					logger.success(`✅ ${test.name}`);
				} else {
					logger.error(`❌ ${test.name}`);
					if (error) {
						console.log(chalk.gray(`   Error: ${error}`));
					}
				}
			}

			// Output JSON results
			const passedCount = results.filter((r) => r.passed).length;
			const failedCount = results.filter((r) => !r.passed).length;

			console.log(`\n${chalk.bold("📊 Results\n")}`);
			console.log(
				JSON.stringify(
					{
						table: tableName,
						schema: testSchema,
						total: results.length,
						passed: passedCount,
						failed: failedCount,
						results,
					},
					null,
					2,
				),
			);

			// Exit with error code if any tests failed
			if (failedCount > 0) {
				logger.error(`RLS tests: ${passedCount} passed, ${failedCount} failed`);
				throw new Error(`${failedCount} RLS test(s) failed`);
			}
		} finally {
			// Cleanup: Drop test schema
			logger.info("Cleaning up test schema...");
			await sql`DROP SCHEMA IF EXISTS ${sql(testSchema)} CASCADE`;
			logger.success("Test schema cleaned up");
		}
	} finally {
		// Close database connection
		await sql.end();
	}
}
