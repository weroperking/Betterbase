import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import * as logger from "../../utils/logger";

export interface IacAnalyzeOptions {
	projectRoot: string;
	output?: "table" | "json";
}

/**
 * Analyze all queries in the project for performance issues
 */
export async function runIacAnalyze(
	projectRoot: string,
	opts?: { output?: "table" | "json" },
): Promise<void> {
	const betterbaseDir = join(projectRoot, "betterbase");

	if (!existsSync(betterbaseDir) || !statSync(betterbaseDir).isDirectory()) {
		logger.error("No betterbase/ directory found. Run this from a BetterBase project.");
		return;
	}

	logger.info("Analyzing queries...");

	const queries = scanQueries(betterbaseDir);
	const results: QueryAnalysis[] = [];

	for (const q of queries) {
		const analysis = analyzeQuery(q, betterbaseDir);
		results.push(analysis);
	}

	// Output results
	if (opts?.output === "json") {
		console.log(JSON.stringify(results, null, 2));
	} else {
		printTable(results);
	}
}

interface QueryAnalysis {
	path: string;
	complexity: "low" | "medium" | "high";
	issues: string[];
	suggestions: string[];
}

function scanQueries(betterbaseDir: string): string[] {
	const queriesDir = join(betterbaseDir, "queries");
	if (!existsSync(queriesDir)) return [];
	if (!statSync(queriesDir).isDirectory()) return [];

	const files: string[] = [];

	function walk(dir: string) {
		for (const entry of readdirSync(dir)) {
			const fullPath = join(dir, entry);
			if (statSync(fullPath).isDirectory()) {
				walk(fullPath);
			} else if (extname(fullPath) === ".ts") {
				files.push(fullPath);
			}
		}
	}

	walk(queriesDir);
	return files;
}

function analyzeQuery(filePath: string, betterbaseDir: string): QueryAnalysis {
	const content = readFileSync(filePath, "utf-8");
	const path = filePath.replace(betterbaseDir + "/", "");

	const issues: string[] = [];
	const suggestions: string[] = [];
	let complexity: "low" | "medium" | "high" = "low";

	// Check for common issues
	if (content.includes(".collect()") && !content.includes(".take(")) {
		issues.push("Unbounded results - no .take() limit");
		suggestions.push("Add .take(n) to limit results");
		complexity = "high";
	}

	if (content.includes("Promise.all") || content.includes("for (")) {
		issues.push("Potential N+1 query pattern");
		suggestions.push("Consider batch fetching or using raw SQL JOINs");
		complexity = complexity === "low" ? "medium" : complexity;
	}

	if (!content.includes("withIndex") && content.includes(".filter(")) {
		issues.push("Filter without explicit index");
		suggestions.push("Add an index for frequently filtered fields in schema.ts");
		complexity = complexity === "low" ? "medium" : complexity;
	}

	if (content.includes("JOIN") || content.includes("join(")) {
		issues.push("Manual join detected");
		suggestions.push("Consider using raw SQL execute() for complex joins");
	}

	return { path, complexity, issues, suggestions };
}

function printTable(results: QueryAnalysis[]) {
	console.log("\n📊 Query Analysis Results\n");
	console.log("═".repeat(80));
	console.log("Path".padEnd(40) + "Complexity".padEnd(15) + "Issues");
	console.log("═".repeat(80));

	for (const r of results) {
		const icon = r.complexity === "high" ? "🔴" : r.complexity === "medium" ? "🟡" : "🟢";
		const issues = r.issues.length > 0 ? r.issues.join(", ") : "OK";
		console.log(r.path.substring(0, 39).padEnd(40) + `${icon} ${r.complexity}`.padEnd(15) + issues);
	}

	console.log("═".repeat(80));

	const total = results.length;
	const high = results.filter((r) => r.complexity === "high").length;
	const medium = results.filter((r) => r.complexity === "medium").length;

	console.log(
		`\nTotal: ${total} | High: ${high} | Medium: ${medium} | Low: ${total - high - medium}\n`,
	);
}
