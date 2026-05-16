import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import * as ts from "typescript";

export interface RouteInfo {
	method: string;
	path: string;
	requiresAuth: boolean;
	inputSchema?: string;
	outputSchema?: string;
}

function getStringLiteral(node: ts.Node | undefined): string {
	if (!node) return "";
	if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
		return node.text;
	}
	return node.getText();
}

function isAuthLikeName(value: string): boolean {
	return (
		/\bauth\b/i.test(value) || /^auth/i.test(value) || /^(authMiddleware|requireAuth)$/i.test(value)
	);
}

const httpMethods = new Set(["get", "post", "put", "patch", "delete", "options", "head"]);

function collectTsFiles(dir: string): string[] {
	const files: string[] = [];

	const walk = (current: string): void => {
		let entries: Array<{
			isDirectory: () => boolean;
			isFile: () => boolean;
			name: string;
		}>;
		try {
			const rawEntries = readdirSync(current, { withFileTypes: true });
			entries = rawEntries.map((e) => ({
				isDirectory: () => e.isDirectory(),
				isFile: () => e.isFile(),
				name: e.name.toString(),
			}));
		} catch {
			return;
		}

		for (const entry of entries) {
			const fullPath = path.join(current, entry.name);
			if (entry.isDirectory()) {
				walk(fullPath);
				continue;
			}

			if (entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) {
				files.push(fullPath);
			}
		}
	};

	walk(dir);
	return files;
}

function unwrapExpression(expression: ts.Expression): ts.Expression {
	let current = expression;
	while (
		ts.isParenthesizedExpression(current) ||
		ts.isAsExpression(current) ||
		ts.isSatisfiesExpression(current)
	) {
		// @ts-ignore – the expression property exists on these node types
		current = current.expression;
	}
	return current;
}

export class RouteScanner {
	scan(routesDir: string): Record<string, RouteInfo[]> {
		const files = collectTsFiles(routesDir);
		const routes: Record<string, RouteInfo[]> = {};

		for (const file of files) {
			const fileRoutes = this.scanFile(file);
			for (const [routePath, entries] of Object.entries(fileRoutes)) {
				routes[routePath] = [...(routes[routePath] ?? []), ...entries];
			}
		}

		return routes;
	}

	private scanFile(filePath: string): Record<string, RouteInfo[]> {
		const sourceCode = readFileSync(filePath, "utf-8");
		const sourceFile = ts.createSourceFile(
			filePath,
			sourceCode,
			ts.ScriptTarget.Latest,
			true,
			ts.ScriptKind.TS,
		);

		const routes: Record<string, RouteInfo[]> = {};
		const authIdentifiers = new Set<string>();

		// ── Collect auth identifiers (unchanged) ───────────────────────────────────
		const collectAuthIdentifiers = (node: ts.Node): void => {
			if (!ts.isVariableStatement(node)) return;

			for (const declaration of node.declarationList.declarations) {
				if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue;
				const initializer = declaration.initializer;
				if (ts.isCallExpression(initializer) && ts.isIdentifier(initializer.expression)) {
					if (
						initializer.expression.text === "createMiddleware" ||
						initializer.expression.text === "requireAuth"
					) {
						authIdentifiers.add(declaration.name.text);
					}
				}

				if (isAuthLikeName(declaration.name.text)) {
					authIdentifiers.add(declaration.name.text);
				}
			}
		};

		ts.forEachChild(sourceFile, collectAuthIdentifiers);

		// ── Collect group definitions for nested route prefixing ────────────────────
		const groupParent: Record<string, string> = {}; // child var -> parent var
		const groupPath: Record<string, string> = {};   // var -> its path segment

		const collectGroups = (node: ts.Node): void => {
			if (ts.isVariableStatement(node)) {
				for (const decl of node.declarationList.declarations) {
					if (!ts.isIdentifier(decl.name) || !decl.initializer) continue;
					// Unwrap to get actual call expression (handle parentheses)
					const init = unwrapExpression(decl.initializer);
					if (ts.isCallExpression(init)) {
						const callExpr = init as ts.CallExpression;
						// Check if the callee is a property access with name "group"
						const callee = callExpr.expression;
						if (
							ts.isPropertyAccessExpression(callee) &&
							callee.name.text === "group"
						) {
							// parent is the object on which .group() is called
							const parentExpr = callee.expression;
							let parentName = "";
							if (ts.isIdentifier(parentExpr)) {
								parentName = parentExpr.text;
							}
							// Extract group path from first argument
							const pathArg = callExpr.arguments[0];
							const pathStr = getStringLiteral(pathArg);
							groupParent[decl.name.text] = parentName;
							groupPath[decl.name.text] = pathStr;
						}
					}
				}
			}
			ts.forEachChild(node, collectGroups);
		};

		collectGroups(sourceFile);

		// Helper: compute full prefix for a router variable by following parent chain
		const getFullPrefix = (varName: string): string => {
			let prefix = "";
			let current = varName;
			const visited = new Set<string>();
			while (groupParent[current] !== undefined && !visited.has(current)) {
				visited.add(current);
				const parent = groupParent[current];
				const segment = groupPath[current] || "";
				// Ensure segment starts with '/'
				const seg = segment.startsWith("/") ? segment : "/" + segment;
				prefix = seg + prefix;
				current = parent;
			}
			return prefix;
		};

		// ── Extract route definitions ─────────────────────────────────────────────
		const isAuthMiddlewareExpression = (expr: ts.Expression): boolean => {
			if (ts.isIdentifier(expr)) {
				return authIdentifiers.has(expr.text) || isAuthLikeName(expr.text);
			}
			if (ts.isPropertyAccessExpression(expr)) {
				const text = expr.getText(sourceFile);
				return isAuthLikeName(text);
			}
			return false;
		};

		const visit = (node: ts.Node): void => {
			if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
				const method = node.expression.name.text.toLowerCase();

				if (httpMethods.has(method)) {
					const [pathArg, ...handlerArgs] = node.arguments;
					const basePath = getStringLiteral(pathArg);

					// Determine the router variable this method is called on
					const routerExpr = node.expression.expression; // the object before .method
					let routerVar: string | null = null;
					if (ts.isIdentifier(routerExpr)) {
						routerVar = routerExpr.text;
					} else if (ts.isPropertyAccessExpression(routerExpr)) {
						// Handle deeper chaining (unlikely): recursively get identifier
						let cur: ts.Node = routerExpr;
						while (ts.isPropertyAccessExpression(cur)) {
							if (ts.isIdentifier(cur.expression)) {
								routerVar = cur.expression.text;
								break;
							}
							cur = cur.expression;
						}
					}

					const prefix = routerVar ? getFullPrefix(routerVar) : "";
					const fullPath = prefix + basePath;

					let requiresAuth = false;
					for (const arg of handlerArgs) {
						if (isAuthMiddlewareExpression(arg)) {
							requiresAuth = true;
							break;
						}
					}

					const route: RouteInfo = {
						method: method.toUpperCase(),
						path: fullPath,
						requiresAuth,
						inputSchema: this.findSchemaUsage(sourceFile, handlerArgs, "input"),
						outputSchema: this.findSchemaUsage(sourceFile, handlerArgs, "output"),
					};

					if (!routes[fullPath]) {
						routes[fullPath] = [];
					}

					routes[fullPath].push(route);
				}
			}

			ts.forEachChild(node, visit);
		};

		visit(sourceFile);
		return routes;
	}

	private findSchemaUsage(
		sourceFile: ts.SourceFile,
		args: readonly ts.Expression[],
		mode: "input" | "output",
	): string | undefined {
		const text = args.map((arg) => arg.getText(sourceFile)).join("\n");

		if (mode === "input") {
			const parseMatch = text.match(/([A-Za-z0-9_]+Schema)\.(safeParse|parse)\(/);
			if (parseMatch) return parseMatch[1];
			const middlewareMatch = text.match(/parseBody\(([^,]+),/);
			if (middlewareMatch) return middlewareMatch[1].trim();
		}

		if (mode === "output") {
			const outputMatch = text.match(/([A-Za-z0-9_]+Schema)\.(parse|safeParse)\([^)]*c\.json/);
			if (outputMatch) return outputMatch[1];
		}

		return undefined;
	}
}
