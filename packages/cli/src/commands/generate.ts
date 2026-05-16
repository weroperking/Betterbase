import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import chalk from "chalk";
import * as logger from "../utils/logger";
import { SchemaScanner, type TableInfo } from "../utils/scanner";
import { withSpinner } from "../utils/spinner";
import { runGenerateGraphqlCommand } from "./graphql";

function toSingular(name: string): string {
	const lower = name.toLowerCase();
	const invariants = new Set(["status", "news", "series"]);
	if (invariants.has(lower)) return name;
	if (/men$/i.test(name)) return name.replace(/men$/i, "man");
	if (/ies$/i.test(name)) return name.replace(/ies$/i, "y");
	if (/(ses|xes|zes|ches|shes)$/i.test(name)) return name.replace(/es$/i, "");
	if (name.endsWith("s") && !name.endsWith("ss")) return name.slice(0, -1);
	return `${name}Item`;
}

function schemaTypeToZod(type: string): string {
	if (type === "integer" || type === "number") return "z.coerce.number()";
	if (type === "boolean") return "z.coerce.boolean()";
	if (type === "json") return "z.unknown()";
	if (type === "datetime") return "z.coerce.date()";
	return "z.string()";
}

function buildSchemaShape(table: TableInfo, mode: "create" | "update"): string {
	return Object.entries(table.columns)
		.filter(([columnName, column]) => !(column.primaryKey || columnName === "id"))
		.map(([columnName, column]) => {
			const base = schemaTypeToZod(column.type);
			const optional = mode === "update" || column.nullable || Boolean(column.defaultValue);
			return `  ${columnName}: ${optional ? `${base}.optional()` : base}`;
		})
		.join(",\n");
}

function buildFilterableColumns(table: TableInfo): string {
	return Object.entries(table.columns)
		.filter(([, column]) => !column.primaryKey)
		.map(([column]) => `  '${column}',`)
		.join("\n");
}

function buildFilterCoercers(table: TableInfo): string {
	return Object.entries(table.columns)
		.filter(([, column]) => !column.primaryKey)
		.map(([column, info]) => `  ${column}: ${schemaTypeToZod(info.type)},`)
		.join("\n");
}

function generateRouteFile(tableName: string, table: TableInfo): string {
	const singular = toSingular(tableName);
	const createShape = buildSchemaShape(table, "create");
	const updateShape = buildSchemaShape(table, "update");
	const filterableColumns = buildFilterableColumns(table);
	const filterCoercers = buildFilterCoercers(table);

	return `import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db } from '../db';
import { realtime } from '../lib/realtime';
import { ${tableName} } from '../db/schema';

export const ${tableName}Route = new Hono();

const createSchema = z.object({
${createShape}
});

const updateSchema = z.object({
${updateShape}
});

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const DEFAULT_OFFSET = 0;

const paginationSchema = z.object({
  limit: z.coerce.number().int().nonnegative().default(DEFAULT_LIMIT),
  offset: z.coerce.number().int().nonnegative().default(DEFAULT_OFFSET),
});

const FILTERABLE_COLUMNS = new Set([
${filterableColumns}
]);

const FILTER_COERCE = {
${filterCoercers}
} as const;

${tableName}Route.get('/', async (c) => {
  const queryParams = c.req.query();
  const paginationResult = paginationSchema.safeParse({
    limit: queryParams.limit,
    offset: queryParams.offset,
  });

  if (!paginationResult.success) {
    return c.json({ error: 'Invalid pagination params', details: paginationResult.error.format() }, 400);
  }

  const { limit, offset } = paginationResult.data;
  const fetchLimit = Math.min(limit, MAX_LIMIT);
  const sort = queryParams.sort;
  const filters = Object.entries(queryParams).filter(
    ([key, value]) => key !== 'limit' && key !== 'offset' && key !== 'sort' && value !== undefined,
  );

  let query = db.select().from(${tableName}).$dynamic();

  if (filters.length > 0) {
    const conditions = filters
      .flatMap(([rawKey, value]) => {
        if (rawKey.endsWith('_in')) {
          const key = rawKey.slice(0, -3);
          if (!FILTERABLE_COLUMNS.has(key)) return [];

          const schema = FILTER_COERCE[key as keyof typeof FILTER_COERCE];
          if (!schema) return [];

          try {
            const parsedInValues = JSON.parse(String(value));
            if (!Array.isArray(parsedInValues)) return [];

            const coercedValues = parsedInValues
              .map((item) => schema.safeParse(item))
              .filter((result) => result.success)
              .map((result) => result.data);

            if (coercedValues.length === 0) return [];

            return [inArray(${tableName}[key as keyof typeof ${tableName}] as never, coercedValues as never[])];
          } catch {
            return [];
          }
        }

        if (!FILTERABLE_COLUMNS.has(rawKey)) return [];
        const schema = FILTER_COERCE[rawKey as keyof typeof FILTER_COERCE];
        if (!schema) return [];

        const parsed = schema.safeParse(value);
        if (!parsed.success) return [];

        return [eq(${tableName}[rawKey as keyof typeof ${tableName}] as never, parsed.data as never)];
      });

    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }
  }

  if (sort) {
    const [field, order] = sort.split(':');
    if (field && field in ${tableName}) {
      const column = ${tableName}[field as keyof typeof ${tableName}] as never;
      query = query.orderBy(order === 'desc' ? desc(column) : asc(column));
    }
  }

  const items = await query.limit(fetchLimit + 1).offset(offset);
  const hasMore = items.length > fetchLimit;

  return c.json({
    ${tableName}: items.slice(0, fetchLimit),
    pagination: { limit: fetchLimit, offset, hasMore },
  });
});

${tableName}Route.get('/:id', async (c) => {
  const id = c.req.param('id');
  const item = await db.select().from(${tableName}).where(eq(${tableName}.id, id as never)).limit(1);

  if (item.length === 0) {
    return c.json({ error: '${tableName} not found' }, 404);
  }

  return c.json({ ${singular}: item[0] });
});

${tableName}Route.post('/', zValidator('json', createSchema), async (c) => {
  const body = c.req.valid('json');
  const created = await db.insert(${tableName}).values(body).returning();
  realtime.broadcast('${tableName}', 'INSERT', created[0]);
  return c.json({ ${singular}: created[0] }, 201);
});

${tableName}Route.patch('/:id', zValidator('json', updateSchema), async (c) => {
  const id = c.req.param('id');
  const body = c.req.valid('json');

  const updated = await db.update(${tableName}).set(body).where(eq(${tableName}.id, id as never)).returning();
  if (updated.length === 0) {
    return c.json({ error: '${tableName} not found' }, 404);
  }

  realtime.broadcast('${tableName}', 'UPDATE', updated[0]);
  return c.json({ ${singular}: updated[0] });
});

${tableName}Route.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const deleted = await db.delete(${tableName}).where(eq(${tableName}.id, id as never)).returning();

  if (deleted.length === 0) {
    return c.json({ error: '${tableName} not found' }, 404);
  }

  realtime.broadcast('${tableName}', 'DELETE', { id });
  return c.json({ message: '${singular} deleted', ${singular}: deleted[0] });
});
`;
}

function updateMainRouter(projectRoot: string, tableName: string): void {
	const routerPath = path.join(projectRoot, "src/routes/index.ts");
	if (!existsSync(routerPath)) {
		logger.warn(`Routes index not found at ${routerPath}. Please wire the route manually.`);
		return;
	}

	let router = readFileSync(routerPath, "utf-8");
	const importLine = `import { ${tableName}Route } from './${tableName}';`;
	const routeLine = `  app.route('/api/${tableName}', ${tableName}Route);`;

	if (!router.includes(importLine)) {
		const firstRouteImport = /import\s+\{\s*healthRoute\s*\}\s+from\s+'\.\/health';/;
		router = firstRouteImport.test(router)
			? router.replace(firstRouteImport, (m) => `${m}\n${importLine}`)
			: `${importLine}\n${router}`;
	}

	if (!router.includes(routeLine)) {
		const routeStatements = [...router.matchAll(/\s*app\.route\([^\n]+\);/g)];
		if (routeStatements.length > 0) {
			const last = routeStatements[routeStatements.length - 1];
			const insertAt = (last.index ?? 0) + last[0].length;
			router = `${router.slice(0, insertAt)}\n${routeLine}${router.slice(insertAt)}`;
		} else {
			router = router.replace(/\n}\s*$/, `\n${routeLine}\n}`);
		}
	}

	writeFileSync(routerPath, router);
}

function ensureRealtimeUtility(projectRoot: string): void {
	const realtimePath = path.join(projectRoot, "src/lib/realtime.ts");
	if (existsSync(realtimePath)) return;

	// Try multiple possible template locations to support both development and production scenarios
	const possiblePaths = [
		// When installed globally and templates are copied to dist/templates (production)
		path.resolve(import.meta.dir, "../../templates/base/src/lib/realtime.ts"),
		// When running from built monorepo (packages/cli/dist -> betterbase/templates)
		path.resolve(import.meta.dir, "../../../templates/base/src/lib/realtime.ts"),
		// When running from monorepo source with one level of nesting
		path.resolve(import.meta.dir, "../../../../templates/base/src/lib/realtime.ts"),
		// When running from monorepo source with betterbase/ subdirectory
		path.resolve(import.meta.dir, "../../../../../betterbase/templates/base/src/lib/realtime.ts"),
	];

	let canonicalRealtimePath: string | null = null;
	for (const testPath of possiblePaths) {
		if (existsSync(testPath)) {
			canonicalRealtimePath = testPath;
			break;
		}
	}

	if (!canonicalRealtimePath) {
		throw new Error(
			`Canonical realtime template not found. Searched:\n${possiblePaths.map((p) => `  - ${p}`).join("\n")}`,
		);
	}

	mkdirSync(path.dirname(realtimePath), { recursive: true });
	writeFileSync(realtimePath, readFileSync(canonicalRealtimePath, "utf-8"));
}

async function ensureZodValidatorInstalled(projectRoot: string): Promise<void> {
	let current = path.resolve(projectRoot);

	while (true) {
		const modulePath = path.join(current, "node_modules", "@hono", "zod-validator");
		if (existsSync(modulePath)) return;

		const packageJsonPath = path.join(current, "package.json");
		if (existsSync(packageJsonPath)) {
			try {
				const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8")) as {
					dependencies?: Record<string, string>;
					devDependencies?: Record<string, string>;
					peerDependencies?: Record<string, string>;
				};

				if (
					packageJson.dependencies?.["@hono/zod-validator"] ||
					packageJson.devDependencies?.["@hono/zod-validator"] ||
					packageJson.peerDependencies?.["@hono/zod-validator"]
				) {
					return;
				}
			} catch {
				// Fall through to install branch.
			}
		}

		const parent = path.dirname(current);
		if (parent === current) break;
		current = parent;
	}

	logger.info("Installing @hono/zod-validator...");
	const child = Bun.spawn(["bun", "add", "@hono/zod-validator"], {
		cwd: projectRoot,
		stdout: "pipe",
		stderr: "pipe",
	});

	const [exitCode, stdout, stderr] = await Promise.all([
		child.exited,
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
	]);

	if (exitCode !== 0) {
		if (stdout.trim()) logger.warn(stdout.trim());
		if (stderr.trim()) logger.error(stderr.trim());
		throw new Error("Failed to install @hono/zod-validator.");
	}
}

export async function runGenerateCrudCommand(
	projectRoot: string,
	tableName: string,
): Promise<void> {
	const resolvedRoot = path.resolve(projectRoot);
	const schemaPath = path.join(resolvedRoot, "src/db/schema.ts");

	if (!existsSync(schemaPath)) {
		throw new Error(`Schema file not found at ${schemaPath}`);
	}

	logger.info(`Generating CRUD for ${tableName}...`);
	logger.section(`Generating CRUD for "${tableName}"`);
	logger.tree([`src/routes/${tableName}.ts`, "Updated src/routes/index.ts"]);
	logger.blank();

	const scanner = new SchemaScanner(schemaPath);
	const tables = await withSpinner(
		"Scanning schema...",
		async () => scanner.scan(),
		{ successText: `Found table ${chalk.cyan(tableName)}` },
	);
	const table = tables[tableName];
	if (!table) {
		throw new Error(`Table "${tableName}" not found in schema.`);
	}

	await ensureZodValidatorInstalled(resolvedRoot);
	ensureRealtimeUtility(resolvedRoot);

	const routesDir = path.join(resolvedRoot, "src/routes");
	mkdirSync(routesDir, { recursive: true });

	const routePath = path.join(routesDir, `${tableName}.ts`);
	await withSpinner(
		"Writing route file...",
		async () => {
			writeFileSync(routePath, generateRouteFile(tableName, table));
		},
		{ successText: `Created ${chalk.cyan(`src/routes/${tableName}.ts`)}` },
	);

	await withSpinner(
		"Updating router index...",
		async () => updateMainRouter(resolvedRoot, tableName),
		{ successText: "Router updated" },
	);

	logger.blank();
	logger.section("Generated endpoints");
	[
		["GET", `/api/${tableName}`, "List all (paginated)"],
		["GET", `/api/${tableName}/:id`, "Get single"],
		["POST", `/api/${tableName}`, "Create"],
		["PATCH", `/api/${tableName}/:id`, "Update"],
		["DELETE", `/api/${tableName}/:id`, "Delete"],
	].forEach(([method, endpoint, desc]) => {
		const color = { GET: chalk.green, POST: chalk.blue, PATCH: chalk.yellow, DELETE: chalk.red }[
			method
		]!;
		console.log(`  ${color(method.padEnd(7))} ${chalk.white(endpoint.padEnd(28))} ${chalk.dim(desc)}`);
	});

	// Regenerate GraphQL schema after CRUD generation
	logger.info("Regenerating GraphQL schema...");
	try {
		await runGenerateGraphqlCommand(resolvedRoot);
	} catch (err) {
		logger.warn(`Failed to regenerate GraphQL: ${(err as Error).message}`);
	}
}
