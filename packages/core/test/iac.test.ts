import { beforeEach, describe, expect, mock, test } from "bun:test";
import { z } from "zod";
import { type CronJob, cron, getCronJobs } from "../src/iac/cron";
import { DatabaseReader, DatabaseWriter, DbContext } from "../src/iac/db-context";
import {
	GuardrailEngine,
	TenantModeSchema,
} from "../src/providers/guardrail";
import { PostgresProviderAdapter } from "../src/providers/index";
import {
	discoverFunctions,
	getFunctionRegistry,
	lookupFunction,
	setFunctionRegistry,
} from "../src/iac/function-registry";
import {
	type ActionRegistration,
	type MutationRegistration,
	type QueryRegistration,
	action,
	mutation,
	query,
} from "../src/iac/functions";
import { generateApiTypes } from "../src/iac/generators/api-typegen";
import { generateDrizzleSchema } from "../src/iac/generators/drizzle-schema-gen";
import { generateMigration } from "../src/iac/generators/migration-gen";
import {
	type Doc,
	type InferSchema,
	type SchemaDefinition,
	type TableDefinition,
	type TableNames,
	defineSchema,
	defineTable,
} from "../src/iac/schema";
import { type SchemaDiff, diffSchemas, formatDiff } from "../src/iac/schema-diff";
import {
	loadSerializedSchema,
	saveSerializedSchema,
	serializeSchema,
} from "../src/iac/schema-serializer";
import { type BrandedId, type Infer, v } from "../src/iac/validators";

describe("IAC Validators (v.*)", () => {
	test("v.string() returns ZodString", () => {
		const schema = v.string();
		expect(schema).toBeInstanceOf(z.ZodString);
		expect(schema.safeParse("hello").success).toBe(true);
		expect(schema.safeParse(123).success).toBe(false);
	});

	test("v.number() returns ZodNumber", () => {
		const schema = v.number();
		expect(schema).toBeInstanceOf(z.ZodNumber);
		expect(schema.safeParse(42).success).toBe(true);
		expect(schema.safeParse("42").success).toBe(false);
	});

	test("v.boolean() returns ZodBoolean", () => {
		const schema = v.boolean();
		expect(schema).toBeInstanceOf(z.ZodBoolean);
		expect(schema.safeParse(true).success).toBe(true);
		expect(schema.safeParse("true").success).toBe(false);
	});

	test("v.null() returns ZodNull", () => {
		const schema = v.null();
		expect(schema).toBeInstanceOf(z.ZodNull);
		expect(schema.safeParse(null).success).toBe(true);
		expect(schema.safeParse(undefined).success).toBe(false);
	});

	test("v.int64() returns ZodBigInt", () => {
		const schema = v.int64();
		expect(schema).toBeInstanceOf(z.ZodBigInt);
		expect(schema.safeParse(BigInt(123)).success).toBe(true);
	});

	test("v.any() returns ZodAny", () => {
		const schema = v.any();
		expect(schema).toBeInstanceOf(z.ZodAny);
		expect(schema.safeParse("anything").success).toBe(true);
		expect(schema.safeParse({ obj: {} }).success).toBe(true);
	});

	test("v.optional() wraps a validator", () => {
		const schema = v.optional(v.string());
		expect(schema).toBeInstanceOf(z.ZodOptional);
		expect(schema.safeParse(undefined).success).toBe(true);
		expect(schema.safeParse("hello").success).toBe(true);
		expect(schema.safeParse(123).success).toBe(false);
	});

	test("v.array() creates array schema", () => {
		const schema = v.array(v.string());
		expect(schema).toBeInstanceOf(z.ZodArray);
		expect(schema.safeParse(["a", "b"]).success).toBe(true);
		expect(schema.safeParse([1, 2]).success).toBe(false);
	});

	test("v.object() creates object schema", () => {
		const schema = v.object({ name: v.string(), age: v.number() });
		expect(schema).toBeInstanceOf(z.ZodObject);
		expect(schema.safeParse({ name: "Alice", age: 30 }).success).toBe(true);
	});

	test("v.union() creates union schema", () => {
		const schema = v.union(v.literal("admin"), v.literal("user"));
		expect(schema).toBeInstanceOf(z.ZodUnion);
		expect(schema.safeParse("admin").success).toBe(true);
		expect(schema.safeParse("user").success).toBe(true);
		expect(schema.safeParse("guest").success).toBe(false);
	});

	test("v.literal() creates literal schema", () => {
		const schema = v.literal("active");
		expect(schema).toBeInstanceOf(z.ZodLiteral);
		expect(schema.safeParse("active").success).toBe(true);
		expect(schema.safeParse("inactive").success).toBe(false);
	});

	test("v.id() creates branded ID type", () => {
		const schema = v.id("users");
		expect(schema).toBeInstanceOf(z.ZodBranded);
		expect(schema.safeParse("user_123").success).toBe(true);
	});

	test("v.datetime() creates datetime schema", () => {
		const schema = v.datetime();
		expect(schema).toBeInstanceOf(z.ZodString);
		expect(schema.safeParse("2024-01-01T00:00:00Z").success).toBe(true);
		expect(schema.safeParse("not-a-date").success).toBe(false);
	});

	test("v.bytes() creates base64 schema", () => {
		const schema = v.bytes();
		expect(schema).toBeInstanceOf(z.ZodString);
		expect(schema.safeParse("SGVsbG8=").success).toBe(true);
	});

	test("Infer type helper works", () => {
		type StringInfer = Infer<ReturnType<typeof v.string>>;
		const typed: StringInfer = "hello";
		expect(typed).toBe("hello");
	});
});

describe("IAC Schema (defineTable)", () => {
	test("defineTable creates table with system fields", () => {
		const table = defineTable({ name: v.string() });

		expect(table._shape).toEqual({ name: expect.any(z.ZodString) });
		expect(table._schema).toBeInstanceOf(z.ZodObject);
		expect(table._indexes).toEqual([]);
	});

	test("defineTable adds index", () => {
		const table = defineTable({ name: v.string() }).index("by_name", ["name"]);

		expect(table._indexes).toHaveLength(1);
		expect(table._indexes[0].type).toBe("index");
		expect(table._indexes[0].name).toBe("by_name");
		expect(table._indexes[0].fields).toEqual(["name"]);
	});

	test("defineTable adds uniqueIndex", () => {
		const table = defineTable({ email: v.string() }).uniqueIndex("by_email", ["email"]);

		expect(table._indexes).toHaveLength(1);
		expect(table._indexes[0].type).toBe("uniqueIndex");
	});

	test("defineTable adds searchIndex", () => {
		const table = defineTable({ title: v.string(), body: v.string() }).searchIndex("search_title", {
			searchField: "title",
		});

		expect(table._indexes).toHaveLength(1);
		expect(table._indexes[0].type).toBe("searchIndex");
	});

	test("defineTable is chainable", () => {
		const table = defineTable({ name: v.string() })
			.index("by_name", ["name"])
			.uniqueIndex("by_name_unique", ["name"])
			.searchIndex("search", { searchField: "name" });

		expect(table._indexes).toHaveLength(3);
	});
});

describe("IAC Schema (defineSchema)", () => {
	test("defineSchema creates schema definition", () => {
		const schema = defineSchema({
			users: defineTable({ name: v.string() }),
		});

		expect(schema._tables).toBeDefined();
		expect(schema._tables.users).toBeDefined();
	});

	test("InferSchema produces document types", () => {
		const schema = defineSchema({
			users: defineTable({ name: v.string() }),
		});

		type UsersDoc = InferSchema<typeof schema>;
		const doc: UsersDoc["users"] = {
			_id: "user_123",
			_createdAt: new Date(),
			_updatedAt: new Date(),
			name: "Alice",
		};

		expect(doc.name).toBe("Alice");
	});

	test("Doc type extracts specific table", () => {
		const schema = defineSchema({
			users: defineTable({ name: v.string() }),
			posts: defineTable({ title: v.string() }),
		});

		type UserDoc = Doc<typeof schema, "users">;
		const doc: UserDoc = {
			_id: "user_123",
			_createdAt: new Date(),
			_updatedAt: new Date(),
			name: "Alice",
		};

		expect(doc.name).toBe("Alice");
	});

	test("TableNames extracts table names", () => {
		const schema = defineSchema({
			users: defineTable({ name: v.string() }),
			posts: defineTable({ title: v.string() }),
		});

		type Names = TableNames<typeof schema>;
		const name: Names = "users";

		expect(name).toBe("users");
	});
});

describe("Schema Serializer", () => {
	test("serializeSchema produces JSON-serializable output", () => {
		const schema = defineSchema({
			users: defineTable({
				name: v.string(),
				email: v.string(),
			}).uniqueIndex("by_email", ["email"]),
		});

		const serialized = serializeSchema(schema);

		expect(serialized.version).toBeDefined();
		expect(serialized.tables).toHaveLength(1);
		expect(serialized.tables[0].name).toBe("users");
	});

	test("serializeSchema marks system fields", () => {
		const schema = defineSchema({
			users: defineTable({ name: v.string() }),
		});

		const serialized = serializeSchema(schema);
		const table = serialized.tables[0];
		const idCol = table.columns.find((c) => c.name === "_id");
		const createdCol = table.columns.find((c) => c.name === "_createdAt");
		const updatedCol = table.columns.find((c) => c.name === "_updatedAt");
		const nameCol = table.columns.find((c) => c.name === "name");

		expect(idCol?.system).toBe(true);
		expect(createdCol?.system).toBe(true);
		expect(updatedCol?.system).toBe(true);
		expect(nameCol?.system).toBe(false);
	});

	test("serializeSchema handles v.id() as id:type", () => {
		const schema = defineSchema({
			posts: defineTable({
				authorId: v.id("users"),
			}),
		});

		const serialized = serializeSchema(schema);
		const authorCol = serialized.tables[0].columns.find((c) => c.name === "authorId");

		expect(authorCol?.type).toStartWith("id:");
	});

	test("serializeSchema handles v.optional()", () => {
		const schema = defineSchema({
			users: defineTable({
				name: v.string(),
				bio: v.optional(v.string()),
			}),
		});

		const serialized = serializeSchema(schema);
		const nameCol = serialized.tables[0].columns.find((c) => c.name === "name");
		const bioCol = serialized.tables[0].columns.find((c) => c.name === "bio");

		expect(nameCol?.optional).toBe(false);
		expect(bioCol?.optional).toBe(true);
	});
});

describe("Schema Diff Engine", () => {
	test("diffSchemas from null produces ADD_TABLE for each table", () => {
		const to = serializeSchema(
			defineSchema({
				users: defineTable({ name: v.string() }),
				posts: defineTable({ title: v.string() }),
			}),
		);

		const diff = diffSchemas(null, to);

		expect(diff.isEmpty).toBe(false);
		expect(diff.changes.filter((c) => c.type === "ADD_TABLE")).toHaveLength(2);
		expect(diff.hasDestructive).toBe(false);
	});

	test("diffSchemas identical schemas produces empty diff", () => {
		const schema = defineSchema({
			users: defineTable({ name: v.string() }),
		});
		const serialized = serializeSchema(schema);

		const diff = diffSchemas(serialized, serialized);

		expect(diff.isEmpty).toBe(true);
		expect(diff.hasDestructive).toBe(false);
	});

	test("diffSchemas detects ADD_COLUMN", () => {
		const from = serializeSchema(
			defineSchema({
				users: defineTable({ name: v.string() }),
			}),
		);
		const to = serializeSchema(
			defineSchema({
				users: defineTable({ name: v.string(), email: v.string() }),
			}),
		);

		const diff = diffSchemas(from, to);

		expect(diff.changes.some((c) => c.type === "ADD_COLUMN")).toBe(true);
		expect(diff.hasDestructive).toBe(false);
	});

	test("diffSchemas detects DROP_COLUMN as destructive", () => {
		const from = serializeSchema(
			defineSchema({
				users: defineTable({ name: v.string(), email: v.string() }),
			}),
		);
		const to = serializeSchema(
			defineSchema({
				users: defineTable({ name: v.string() }),
			}),
		);

		const diff = diffSchemas(from, to);

		expect(diff.changes.some((c) => c.type === "DROP_COLUMN")).toBe(true);
		expect(diff.hasDestructive).toBe(true);
	});

	test("diffSchemas detects ALTER_COLUMN as potentially destructive", () => {
		const from = serializeSchema(
			defineSchema({
				users: defineTable({ name: v.string() }),
			}),
		);
		const to = serializeSchema(
			defineSchema({
				users: defineTable({ name: v.number() }),
			}),
		);

		const diff = diffSchemas(from, to);

		expect(diff.changes.some((c) => c.type === "ALTER_COLUMN")).toBe(true);
		expect(diff.hasDestructive).toBe(true);
	});

	test("diffSchemas detects ADD_INDEX", () => {
		const from = serializeSchema(
			defineSchema({
				users: defineTable({ name: v.string() }),
			}),
		);
		const to = serializeSchema(
			defineSchema({
				users: defineTable({ name: v.string() }).index("by_name", ["name"]),
			}),
		);

		const diff = diffSchemas(from, to);

		expect(diff.changes.some((c) => c.type === "ADD_INDEX")).toBe(true);
	});

	test("formatDiff produces human-readable output", () => {
		const to = serializeSchema(
			defineSchema({
				users: defineTable({ name: v.string() }),
			}),
		);
		const diff = diffSchemas(null, to);
		const formatted = formatDiff(diff);

		expect(formatted).toContain("ADD TABLE");
	});
});

describe("Function Primitives (query, mutation, action)", () => {
	test("query creates query registration", () => {
		const q = query({
			args: { id: v.string() },
			handler: async (ctx, args) => ({ id: args.id, name: "Alice" }),
		});

		expect(q._args).toBeInstanceOf(z.ZodObject);
		expect(q._handler).toBeInstanceOf(Function);
		expect(q._handler).toBeDefined();
	});

	test("mutation creates mutation registration", () => {
		const m = mutation({
			args: { name: v.string() },
			handler: async (ctx, args) => ({ success: true }),
		});

		expect(m._args).toBeInstanceOf(z.ZodObject);
		expect(m._handler).toBeInstanceOf(Function);
	});

	test("action creates action registration", () => {
		const a = action({
			args: { email: v.string() },
			handler: async (ctx, args) => ({ sent: true }),
		});

		expect(a._args).toBeInstanceOf(z.ZodObject);
		expect(a._handler).toBeInstanceOf(Function);
	});

	test("query validates args", async () => {
		const q = query({
			args: { id: v.string() },
			handler: async (ctx, args) => args.id,
		});

		const validArgs = { id: "123" };
		const parsed = q._args.safeParse(validArgs);

		expect(parsed.success).toBe(true);
		expect(parsed.data).toEqual(validArgs);
	});

	test("query rejects invalid args", () => {
		const q = query({
			args: { id: v.string() },
			handler: async (ctx, args) => args.id,
		});

		const invalidArgs = { id: 123 };
		const parsed = q._args.safeParse(invalidArgs);

		expect(parsed.success).toBe(false);
	});
});

describe("DatabaseReader", () => {
	test("DatabaseReader has get and query methods", () => {
		const mockPool = {
			query: async () => ({ rows: [] }),
		} as any;

		const reader = new DatabaseReader(mockPool, "public");

		expect(reader.get).toBeInstanceOf(Function);
		expect(reader.query).toBeInstanceOf(Function);
	});
});

describe("DbContext tenant guardrails", () => {
	test("DbContext enforces tenant scoping on writes via guardrail engine", () => {
		const mockPool = { query: async () => ({ rows: [] }) } as any;
		const adapter = new PostgresProviderAdapter();
		const engine = new GuardrailEngine(
			adapter,
			TenantModeSchema.parse({ enabled: true }),
		);
		const ctx = new DbContext(mockPool, "public", { guardrail: engine });

		expect(() => ctx.writer.insert("invoices", { amount: 10 })).toThrow();
		// A tenant-bound context satisfies scoping.
		expect(() =>
			ctx.asTenant("t1").writer.insert("invoices", { amount: 10 }),
		).not.toThrow();
	});

	test("ctx.asTenant binds a tenant id so writes pass", () => {
		const mockPool = { query: async () => ({ rows: [] }) } as any;
		const engine = new GuardrailEngine(
			new PostgresProviderAdapter(),
			TenantModeSchema.parse({ enabled: true }),
		);
		const ctx = new DbContext(mockPool, "public", { guardrail: engine });
		const scoped = ctx.asTenant("t1");

		expect(() => scoped.writer.insert("invoices", { amount: 10 })).not.toThrow();
	});

	test("DbContext without guardrail is backwards-compatible passthrough", () => {
		const mockPool = { query: async () => ({ rows: [] }) } as any;
		const ctx = new DbContext(mockPool, "public");
		expect(() => ctx.writer.insert("invoices", { amount: 10 })).not.toThrow();
	});
});

describe("DatabaseWriter", () => {
	test("DatabaseWriter extends DatabaseReader", () => {
		const mockPool = {
			query: async () => ({ rows: [] }),
		} as any;

		const writer = new DatabaseWriter(mockPool, "public");

		expect(writer.get).toBeInstanceOf(Function);
		expect(writer.insert).toBeInstanceOf(Function);
		expect(writer.patch).toBeInstanceOf(Function);
		expect(writer.replace).toBeInstanceOf(Function);
		expect(writer.delete).toBeInstanceOf(Function);
	});
});

describe("Function Registry", () => {
	test("setFunctionRegistry and getFunctionRegistry", () => {
		const functions = [
			{ kind: "query" as const, path: "test/fn", name: "fn", module: "/test.ts", handler: {} },
		];

		setFunctionRegistry(functions);
		const retrieved = getFunctionRegistry();

		expect(retrieved).toHaveLength(1);
		expect(retrieved[0].path).toBe("test/fn");
	});

	test("lookupFunction finds registered function", () => {
		setFunctionRegistry([
			{
				kind: "query" as const,
				path: "queries/users/getUser",
				name: "getUser",
				module: "/test.ts",
				handler: {},
			},
		]);

		const fn = lookupFunction("queries/users/getUser");

		expect(fn).toBeDefined();
		expect(fn?.name).toBe("getUser");
	});

	test("lookupFunction returns null for unknown path", () => {
		setFunctionRegistry([]);

		const fn = lookupFunction("queries/unknown");

		expect(fn).toBeNull();
	});
});

describe("Cron Jobs", () => {
	test("cron registers a job", () => {
		const jobs = getCronJobs().length;

		const mockMutation = mutation({
			args: {},
			handler: async () => {},
		});

		cron("test-job", "0 * * * *", mockMutation, {});

		expect(getCronJobs()).toHaveLength(jobs + 1);
		expect(getCronJobs()[0].name).toBe("test-job");
		expect(getCronJobs()[0].schedule).toBe("0 * * * *");
	});
});

describe("Drizzle Schema Generator", () => {
	test("generateDrizzleSchema produces valid code", () => {
		const schema = serializeSchema(
			defineSchema({
				users: defineTable({
					name: v.string(),
					email: v.string(),
				}).uniqueIndex("by_email", ["email"]),
			}),
		);

		const code = generateDrizzleSchema(schema, "sqlite");

		expect(code).toContain("sqliteTable");
		expect(code).toContain("users");
		expect(code).toContain("AUTO-GENERATED");
	});

	test("generateDrizzleSchema supports postgres dialect", () => {
		const schema = serializeSchema(
			defineSchema({
				users: defineTable({ name: v.string() }),
			}),
		);

		const code = generateDrizzleSchema(schema, "postgres");

		expect(code).toContain("pgTable");
		expect(code).toContain("text");
	});
});

describe("Migration Generator", () => {
	test("generateMigration produces valid SQL", () => {
		const to = serializeSchema(
			defineSchema({
				users: defineTable({ name: v.string() }),
			}),
		);
		const diff = diffSchemas(null, to);

		const migration = generateMigration(diff, 1, "initial_schema");

		expect(migration.filename).toBe("0001_initial_schema.sql");
		expect(migration.sql).toContain("CREATE TABLE");
	});

	test("generateMigration handles ADD_COLUMN", () => {
		const from = serializeSchema(
			defineSchema({
				users: defineTable({ name: v.string() }),
			}),
		);
		const to = serializeSchema(
			defineSchema({
				users: defineTable({ name: v.string(), email: v.string() }),
			}),
		);
		const diff = diffSchemas(from, to);

		const migration = generateMigration(diff, 2, "add_email");

		expect(migration.sql).toContain("ADD COLUMN");
	});
});

describe("API Type Generator", () => {
	test("generateApiTypes produces declaration file", () => {
		const functions = [
			{
				kind: "query" as const,
				path: "queries/users/getUser",
				name: "getUser",
				module: "/test.ts",
				handler: { _args: z.object({}), _handler: () => {} },
			},
		];

		const types = generateApiTypes(functions);

		expect(types).toContain("AUTO-GENERATED");
		expect(types).toContain("api:");
		expect(types).toContain("QueryRegistration");
	});

	test("generateApiTypes groups by kind and file", () => {
		const functions = [
			{
				kind: "query" as const,
				path: "queries/users/list",
				name: "list",
				module: "/test.ts",
				handler: { _args: z.object({}), _handler: () => {} },
			},
			{
				kind: "mutation" as const,
				path: "mutations/users/create",
				name: "create",
				module: "/test.ts",
				handler: { _args: z.object({}), _handler: () => {} },
			},
		];

		const types = generateApiTypes(functions);

		expect(types).toContain("queries:");
		expect(types).toContain("mutations:");
	});
});
