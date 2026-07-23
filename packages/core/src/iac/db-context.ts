import { nanoid } from "nanoid";
import type { Pool } from "pg";
import {
	GuardrailEngine,
	GuardrailViolationError,
	type EnforceOptions,
	type TenantMode,
} from "../providers/guardrail";

// ─── Query Builder (chainable) ─────────────────────────────────────────────

export class IaCQueryBuilder<T = unknown> {
	private _table: string;
	private _pool: Pool;
	private _schema: string;
	private _filters: string[] = [];
	private _params: unknown[] = [];
	private _orderBy: string | null = null;
	private _orderDir: "ASC" | "DESC" = "ASC";
	private _limit: number | null = null;
	private _indexName: string | null = null;
	private _tenantId?: string;

	constructor(table: string, pool: Pool, schema: string, tenantId?: string) {
		this._table = table;
		this._pool = pool;
		this._schema = schema;
		this._tenantId = tenantId;
	}

	/** Filter using an index — short-circuits to index-aware SQL */
	withIndex(indexName: string, _builder: (q: IndexQueryBuilder) => IndexQueryBuilder): this {
		this._indexName = indexName;
		// For v1: treated as a filter hint only; actual index usage is via SQL planner
		return this;
	}

	filter(field: string, op: "eq" | "neq" | "gt" | "gte" | "lt" | "lte", value: unknown): this {
		const idx = this._params.length + 1;
		const opMap = { eq: "=", neq: "!=", gt: ">", gte: ">=", lt: "<", lte: "<=" };
		this._filters.push(`"${field}" ${opMap[op]} $${idx}`);
		this._params.push(value);
		return this;
	}

	order(direction: "asc" | "desc", field = "_createdAt"): this {
		this._orderBy = field;
		this._orderDir = direction === "asc" ? "ASC" : "DESC";
		return this;
	}

	take(n: number): this {
		this._limit = n;
		return this;
	}

	private _buildSQL(): { sql: string; params: unknown[] } {
		const table = `"${this._schema}"."${this._table}"`;
		let sql = `SELECT * FROM ${table}`;
		const params = this._params.slice();
		const filters = this._filters.slice();
		if (this._tenantId) {
			const idx = params.length + 1;
			filters.unshift(`"tenant_id" = $${idx}`);
			params.push(this._tenantId);
		}
		if (filters.length) sql += ` WHERE ${filters.join(" AND ")}`;
		if (this._orderBy) sql += ` ORDER BY "${this._orderBy}" ${this._orderDir}`;
		if (this._limit) sql += ` LIMIT ${this._limit}`;
		return { sql, params };
	}

	async collect(): Promise<T[]> {
		const { sql, params } = this._buildSQL();
		const { rows } = await this._pool.query(sql, params as any[]);
		return rows as T[];
	}

	async first(): Promise<T | null> {
		const { sql, params } = this._buildSQL();
		const { rows } = await this._pool.query(`${sql} LIMIT 1`, params as any[]);
		return (rows[0] as T) ?? null;
	}

	async unique(): Promise<T | null> {
		const results = await this.collect();
		if (results.length > 1) throw new Error(`Expected unique result, got ${results.length}`);
		return results[0] ?? null;
	}

	/** Full-text search using PostgreSQL tsvector */
	async search(query: string, options?: { limit?: number; rank?: boolean }): Promise<T[]> {
		const limit = options?.limit ?? 20;
		const table = `"${this._schema}"."${this._table}"`;

		// Find text columns to search (simple heuristic: all text columns)
		// In production, you'd track which columns have the search index
		const sql = `
			SELECT *, ts_rank(to_tsvector('english', coalesce(title, '') || ' ' || coalesce(content, '')), plainto_tsquery('english', $1)) as rank
			FROM ${table}
			WHERE to_tsvector('english', coalesce(title, '') || ' ' || coalesce(content, '')) @@ plainto_tsquery('english', $1)
			ORDER BY rank DESC
			LIMIT ${limit}
		`;

		const { rows } = await this._pool.query(sql, [query]);
		return rows as T[];
	}

	/** Vector similarity search using pgvector */
	async similarity(
		embedding: number[],
		options?: { column?: string; topK?: number; threshold?: number },
	) {
		const column = options?.column ?? "embedding";
		const topK = options?.topK ?? 10;
		const threshold = options?.threshold;
		const table = `"${this._schema}"."${this._table}"`;

		const embeddingStr = `[${embedding.join(",")}]`;
		let sql = `
			SELECT *, (${column} <-> $1::vector) as distance
			FROM ${table}
			WHERE ${column} IS NOT NULL
		`;

		if (threshold !== undefined) {
			sql += ` AND (${column} <-> $1::vector) < ${threshold}`;
		}

		sql += ` ORDER BY ${column} <-> $1::vector LIMIT ${topK}`;

		const { rows } = await this._pool.query(sql, [embeddingStr]);
		return rows as (T & { distance: number })[];
	}
}

// Stub — used by withIndex for type inference
class IndexQueryBuilder {
	eq(field: string, value: unknown) {
		return this;
	}
	gt(field: string, value: unknown) {
		return this;
	}
	gte(field: string, value: unknown) {
		return this;
	}
	lt(field: string, value: unknown) {
		return this;
	}
	lte(field: string, value: unknown) {
		return this;
	}
}

// ─── DatabaseReader ────────────────────────────────────────────────────────

export class DatabaseReader {
	constructor(
		protected _pool: Pool,
		protected _schema: string,
		/** Optional guardrail engine for tenant-mode enforcement. */
		protected _guardrail?: GuardrailEngine | null,
		/** Active tenant id for this context (when tenant-scoped). */
		protected _tenantId?: string,
		/** Tables exempt from tenant scoping. */
		protected _tenantExemptTables: string[] = [],
	) {}

	/** Build tenant-scoped enforcement options for a given table. */
	protected _enforceOpts(table: string): EnforceOptions {
		return {
			tenantId: this._tenantId,
			exemptTables: this._tenantExemptTables,
		};
	}

	_contextParams(): { pool: Pool; schema: string; guardrail?: GuardrailEngine | null; tenantId?: string; tenantExemptTables: string[] } {
		return { pool: this._pool, schema: this._schema, guardrail: this._guardrail, tenantId: this._tenantId, tenantExemptTables: this._tenantExemptTables };
	}

	/** Get a document by ID */
	async get<T = unknown>(table: string, id: string): Promise<T | null> {
		this._guardrail?.enforceRead(table, this._enforceOpts(table));
		const query = this._tenantId
			? `SELECT * FROM "${this._schema}"."${table}" WHERE _id = $1 AND tenant_id = $2 LIMIT 1`
			: `SELECT * FROM "${this._schema}"."${table}" WHERE _id = $1 LIMIT 1`;
		const params = this._tenantId ? ([id, this._tenantId] as unknown[]) : ([id] as unknown[]);
		const { rows } = await this._pool.query(query, params);
		return (rows[0] as T) ?? null;
	}

	/** Start a query builder for a table */
	query<T = unknown>(table: string): IaCQueryBuilder<T> {
		this._guardrail?.enforceRead(table, this._enforceOpts(table));
		return new IaCQueryBuilder<T>(table, this._pool, this._schema, this._tenantId);
	}

	/** Execute raw SQL (read-only). Automatically prefixes tables with project schema.
	 * Only allows SELECT statements for security. */
	async execute(sql: string, params?: unknown[]): Promise<{ rows: unknown[]; rowCount: number }> {
		const sanitized = this._sanitizeSQL(sql);
		const finalSql = this._prefixSchema(sanitized);
		const { rows, rowCount } = await this._pool.query(finalSql, params as any[]);
		return { rows, rowCount: rowCount ?? 0 };
	}

	/** Analyze a query to get execution plan and suggestions */
	async analyze(
		sql: string,
		params?: unknown[],
	): Promise<{
		plan: unknown;
		estimatedCost: number;
		suggestedIndexes: string[];
		isSlow: boolean;
	}> {
		const sanitized = this._sanitizeSQL(sql, true);
		const finalSql = this._prefixSchema(sanitized);
		const { rows } = await this._pool.query(`EXPLAIN ANALYZE ${finalSql}`, params as any[]);

		const planText = rows.map((r: any) => r["QUERY PLAN"]).join("\n");
		const estimatedCost = this._extractCost(planText);
		const isSlow = estimatedCost > 1000;
		const suggestedIndexes = this._suggestIndexes(planText);

		return { plan: rows, estimatedCost, suggestedIndexes, isSlow };
	}

	protected _sanitizeSQL(sql: string, allowExplain = false): string {
		const trimmed = sql.trim().toUpperCase();

		// Block dangerous commands unless explicitly allowed
		const forbidden = [
			"DROP",
			"TRUNCATE",
			"DELETE",
			"INSERT",
			"UPDATE",
			"ALTER",
			"CREATE",
			"GRANT",
			"REVOKE",
		];
		if (!allowExplain) {
			forbidden.push("EXPLAIN");
		}

		for (const cmd of forbidden) {
			if (trimmed.startsWith(cmd)) {
				// Allow EXPLAIN only if explicitly allowed
				if (cmd === "EXPLAIN" && allowExplain) continue;
				throw new Error(`SQL command '${cmd}' is not allowed. Only SELECT queries are permitted.`);
			}
		}

		return sql;
	}

	protected _prefixSchema(sql: string): string {
		// Replace table names with schema-prefixed versions
		// Simple implementation: find table references and prefix them
		// For complex queries, users should use execute with full table paths
		return sql.replace(/(?:FROM|JOIN)\s+(\w+)/gi, (match, table) => {
			// Don't prefix already schema-qualified tables or common SQL keywords
			if (table.includes(".") || ["information_schema", "pg_"].includes(table.toLowerCase())) {
				return match;
			}
			return match.replace(table, `"${this._schema}"."${table}"`);
		});
	}

	private _extractCost(planText: string): number {
		const costMatch = planText.match(/cost=(\d+\.?\d*)\.\.(\d+\.?\d*)/);
		if (costMatch) {
			return Number.parseFloat(costMatch[2]);
		}
		return 0;
	}

	private _suggestIndexes(planText: string): string[] {
		const suggestions: string[] = [];
		if (planText.includes("Seq Scan")) {
			suggestions.push("Consider adding an index for the queried column");
		}
		return suggestions;
	}
}

// ─── DatabaseWriter ──────────────────────────────────────────────────────────

export type ChangeHook = (
	table: string,
	type: "INSERT" | "UPDATE" | "DELETE",
	data: Record<string, unknown> | { _id: string },
) => void | Promise<void>;

export class DatabaseWriter extends DatabaseReader {
	private _mutations: (() => Promise<void>)[] = [];
	private _onChange?: ChangeHook;

	constructor(
		pool: Pool,
		schema: string,
		guardrail?: GuardrailEngine | null,
		tenantId?: string,
		tenantExemptTables: string[] = [],
		options?: { onChange?: ChangeHook },
	) {
		super(pool, schema, guardrail, tenantId, tenantExemptTables);
		this._onChange = options?.onChange;
	}

	/** Insert a document, returning its generated ID */
	async insert(table: string, data: Record<string, unknown>): Promise<string> {
		this._guardrail?.enforceWrite(table, this._enforceOpts(table));
		const id = nanoid();
		const now = new Date();
		const doc: Record<string, unknown> = { ...data, _id: id, _createdAt: now, _updatedAt: now };

		if (this._tenantId && !("tenant_id" in doc)) {
			doc.tenant_id = this._tenantId;
		}

		const keys = Object.keys(doc)
			.map((k) => `"${k}"`)
			.join(", ");
		const placeholders = Object.keys(doc)
			.map((_, i) => `$${i + 1}`)
			.join(", ");
		const values = Object.values(doc);

		await this._pool.query(
			`INSERT INTO "${this._schema}"."${table}" (${keys}) VALUES (${placeholders})`,
			values as any[],
		);

		// Emit change event for real-time invalidation
		this._emitChange(table, "INSERT", id);
		this._dispatch(table, "INSERT", doc);
		return id;
	}

	/** Partial update — merges provided fields, updates `_updatedAt` */
	async patch(table: string, id: string, fields: Record<string, unknown>): Promise<void> {
		this._guardrail?.enforceWrite(table, this._enforceOpts(table));
		const updates = Object.entries(fields)
			.map(([k], i) => `"${k}" = $${i + 2}`)
			.join(", ");
		const values = this._tenantId
			? [id, this._tenantId, ...Object.values(fields)]
			: [id, ...Object.values(fields)];
		const query = this._tenantId
			? `UPDATE "${this._schema}"."${table}" SET ${updates}, "_updatedAt" = NOW() WHERE _id = $1 AND tenant_id = $2`
			: `UPDATE "${this._schema}"."${table}" SET ${updates}, "_updatedAt" = NOW() WHERE _id = $1`;
		await this._pool.query(query, values as any[]);
		this._emitChange(table, "UPDATE", id);
		this._dispatch(table, "UPDATE", { _id: id, ...fields });
	}

	/** Full replace — replaces all user fields (preserves system fields) */
	async replace(table: string, id: string, data: Record<string, unknown>): Promise<void> {
		await this.patch(table, id, data);
	}

	/** Delete a document by ID */
	async delete(table: string, id: string): Promise<void> {
		this._guardrail?.enforceWrite(table, this._enforceOpts(table));
		const query = this._tenantId
			? `DELETE FROM "${this._schema}"."${table}" WHERE _id = $1 AND tenant_id = $2`
			: `DELETE FROM "${this._schema}"."${table}" WHERE _id = $1`;
		const params = this._tenantId ? ([id, this._tenantId] as unknown[]) : ([id] as unknown[]);
		await this._pool.query(query, params);
		this._emitChange(table, "DELETE", id);
		this._dispatch(table, "DELETE", { _id: id });
	}

	/** Execute raw SQL. Supports SELECT, INSERT, UPDATE, DELETE.
	 * Automatically prefixes tables with project schema.
	 * WARNING: Be careful with write operations - they bypass transaction safety. */
	async execute(sql: string, params?: unknown[]): Promise<{ rows: unknown[]; rowCount: number }> {
		const sanitized = this._sanitizeSQL(sql, true); // Allow EXPLAIN for analysis
		const finalSql = this._prefixSchema(sanitized);
		const { rows, rowCount } = await this._pool.query(finalSql, params as any[]);

		// Emit change events for write operations
		const trimmed = sql.trim().toUpperCase();
		if (
			trimmed.startsWith("INSERT") ||
			trimmed.startsWith("UPDATE") ||
			trimmed.startsWith("DELETE")
		) {
			const type: "INSERT" | "UPDATE" | "DELETE" = trimmed.startsWith("INSERT")
				? "INSERT"
				: trimmed.startsWith("UPDATE")
					? "UPDATE"
					: "DELETE";
			this._emitChange("unknown", type, ""); // Invalidate all subscriptions
			// Suppress table-scoped webhook dispatch: raw SQL writes cannot reliably
			// derive the affected table/payload, and "unknown"/{} would never match
			// configured webhooks. The cache-invalidation above is preserved.
		}

		return { rows, rowCount: rowCount ?? 0 };
	}

	private _emitChange(table: string, type: "INSERT" | "UPDATE" | "DELETE", id: string) {
		// Emit to the global realtime manager (IAC-21)
		const mgr = (globalThis as any).__betterbaseRealtimeManager;
		mgr?.emitTableChange?.({ table, type, id });
	}

	/**
	 * Fire-and-forget fan-out hook for side effects (e.g. webhook dispatch).
	 * Errors are caught and logged so they never break the DB write response.
	 */
	private _dispatch(
		table: string,
		type: "INSERT" | "UPDATE" | "DELETE",
		data: Record<string, unknown>,
	) {
		if (!this._onChange) return;
		Promise.resolve()
			.then(() => this._onChange!(table, type, data))
			.catch((err) => {
				console.error(`[betterbase] onChange hook failed for ${type} on ${table}:`, err);
			});
	}
}

// ─── DbContext (tenant-aware) ──────────────────────────────────────────────

/**
 * Tenant-aware database context.
 *
 * Wraps a {@link DatabaseReader} / {@link DatabaseWriter} pair and, when tenant
 * mode is configured, enforces tenant scoping on every read/write via the
 * {@link GuardrailEngine}. When no guardrail engine is active (tenant mode off)
 * everything passes through unchanged — fully backwards compatible.
 */
export class DbContext {
	readonly reader: DatabaseReader;
	readonly writer: DatabaseWriter;

	constructor(
		pool: Pool,
		schema: string,
		options?: {
			guardrail?: GuardrailEngine | null;
			tenantId?: string;
			tenantExemptTables?: string[];
		},
	) {
		const { guardrail = null, tenantId, tenantExemptTables = [] } = options ?? {};
		this.reader = new DatabaseReader(
			pool,
			schema,
			guardrail,
			tenantId,
			tenantExemptTables,
		);
		this.writer = new DatabaseWriter(
			pool,
			schema,
			guardrail,
			tenantId,
			tenantExemptTables,
		);
	}

	/**
	 * Return a new context bound to a tenant. The returned context enforces the
	 * tenant id on all subsequent reads/writes. The original context is
	 * unaffected.
	 */
	asTenant(tenantId: string): DbContext {
		const ctx = this.reader._contextParams();
		return new DbContext(ctx.pool, ctx.schema, {
			guardrail: ctx.guardrail ?? null,
			tenantId,
			tenantExemptTables: ctx.tenantExemptTables,
		});
	}
}
