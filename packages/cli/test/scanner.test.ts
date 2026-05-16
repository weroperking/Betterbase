import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { SchemaScanner } from "../src/utils/scanner";

describe("SchemaScanner", () => {
	test("extracts tables, columns, relations, and indexes from drizzle schema", () => {
		const dir = mkdtempSync(path.join(tmpdir(), "bb-scanner-"));

		try {
			const schemaPath = path.join(dir, "schema.ts");
			writeFileSync(
				schemaPath,
				`
          import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

          export const users = sqliteTable('users', {
            id: text('id').primaryKey(),
            email: text('email').notNull().unique(),
            age: integer('age').default(18),
          }, (table) => ({
            usersEmailIdx: index('users_email_idx').on(table.email),
          }));

          export const posts = sqliteTable('posts', {
            id: text('id').primaryKey(),
            userId: text('user_id').notNull().references(() => users.id),
            title: text('title').notNull(),
          });

          export const comments = sqliteTable('comments', {
            id: text('id').primaryKey(),
            postId: text('post_id').notNull().references(() => posts.id),
            body: text('body'),
          });
        `,
			);

			const scanner = new SchemaScanner(schemaPath);
			const tables = scanner.scan();

			expect(Object.keys(tables)).toEqual(["users", "posts", "comments"]);

			expect(tables.users.name).toBe("users");
			expect(tables.users.columns.id.primaryKey).toBe(true);
			expect(tables.users.columns.id.nullable).toBe(false);
			expect(tables.users.columns.email.unique).toBe(true);
			expect(tables.users.columns.age.defaultValue).toBe("18");
			expect(tables.users.indexes).toContain("usersEmailIdx");

			expect(tables.posts.columns.userId.references).toBe("() => users.id");
			expect(tables.posts.relations).toContain("() => users.id");

			expect(tables.comments.columns.postId.references).toBe("() => posts.id");
			expect(tables.comments.relations).toContain("() => posts.id");
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("handles empty tables (zero columns)", () => {
		const dir = mkdtempSync(path.join(tmpdir(), "bb-scanner-"));

		try {
			const schemaPath = path.join(dir, "schema.ts");
			writeFileSync(
				schemaPath,
				`
          import { sqliteTable } from 'drizzle-orm/sqlite-core';

          export const emptyTable = sqliteTable('empty_table', {});
        `,
			);

			const scanner = new SchemaScanner(schemaPath);
			const tables = scanner.scan();

			expect(Object.keys(tables)).toEqual(["emptyTable"]);
			expect(tables.emptyTable.name).toBe("empty_table");
			expect(Object.keys(tables.emptyTable.columns)).toEqual([]);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("handles tables with no relations", () => {
		const dir = mkdtempSync(path.join(tmpdir(), "bb-scanner-"));

		try {
			const schemaPath = path.join(dir, "schema.ts");
			writeFileSync(
				schemaPath,
				`
          import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

          export const users = sqliteTable('users', {
            id: text('id').primaryKey(),
            name: text('name').notNull(),
          });

          export const posts = sqliteTable('posts', {
            id: text('id').primaryKey(),
            title: text('title').notNull(),
            content: text('content'),
          });
        `,
			);

			const scanner = new SchemaScanner(schemaPath);
			const tables = scanner.scan();

			expect(Object.keys(tables)).toEqual(["users", "posts"]);

			expect(tables.users.relations).toEqual([]);
			expect(tables.posts.relations).toEqual([]);
			expect(tables.users.columns.id.references).toBeUndefined();
			expect(tables.posts.columns.id.references).toBeUndefined();
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("handles circular foreign key dependencies", () => {
		const dir = mkdtempSync(path.join(tmpdir(), "bb-scanner-"));

		try {
			const schemaPath = path.join(dir, "schema.ts");
			writeFileSync(
				schemaPath,
				`
          import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

          export const users = sqliteTable('users', {
            id: text('id').primaryKey(),
            postId: text('post_id').references(() => posts.id),
            name: text('name').notNull(),
          });

          export const posts = sqliteTable('posts', {
            id: text('id').primaryKey(),
            userId: text('user_id').references(() => users.id),
            title: text('title').notNull(),
          });
        `,
			);

			const scanner = new SchemaScanner(schemaPath);
			const tables = scanner.scan();

			expect(Object.keys(tables)).toEqual(["users", "posts"]);

			expect(tables.users.columns.postId.references).toBe("() => posts.id");
			expect(tables.users.relations).toContain("() => posts.id");

			expect(tables.posts.columns.userId.references).toBe("() => users.id");
			expect(tables.posts.relations).toContain("() => users.id");
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("handles array columns", () => {
		const dir = mkdtempSync(path.join(tmpdir(), "bb-scanner-"));

		try {
			const schemaPath = path.join(dir, "schema.ts");
			writeFileSync(
				schemaPath,
				`
          import { sqliteTable, text, integer, pgTable, serial, varchar } from 'drizzle-orm/pg-core';

          export const users = pgTable('users', {
            id: serial('id').primaryKey(),
            tags: text('tags').array(),
            names: varchar('names', { length: 100 }).array(),
          });
        `,
			);

			const scanner = new SchemaScanner(schemaPath);
			const tables = scanner.scan();

			expect(Object.keys(tables)).toEqual(["users"]);

			expect(tables.users.columns.tags.dataType).toBe("text");
			expect(tables.users.columns.tags.array).toBe(true);

			expect(tables.users.columns.names.dataType).toBe("varchar");
			expect(tables.users.columns.names.array).toBe(true);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("handles enum columns", () => {
		const dir = mkdtempSync(path.join(tmpdir(), "bb-scanner-"));

		try {
			const schemaPath = path.join(dir, "schema.ts");
			writeFileSync(
				schemaPath,
				`
          import { sqliteTable, text, pgTable, serial, varchar } from 'drizzle-orm/pg-core';

          export const users = pgTable('users', {
            id: serial('id').primaryKey(),
            status: text('status').enum(['status', 'active', 'inactive']),
            role: varchar('role', { length: 50 }).enum(['admin', 'user', 'guest']),
          });
        `,
			);

			const scanner = new SchemaScanner(schemaPath);
			const tables = scanner.scan();

			expect(Object.keys(tables)).toEqual(["users"]);

			expect(tables.users.columns.status.dataType).toBe("text");
			expect(tables.users.columns.status.enum).toEqual(['status', 'active', 'inactive']);

			expect(tables.users.columns.role.dataType).toBe("varchar");
			expect(tables.users.columns.role.enum).toEqual(['admin', 'user', 'guest']);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("handles large complex schema with 5 interconnected tables", () => {
		const dir = mkdtempSync(path.join(tmpdir(), "bb-scanner-"));

		try {
			const schemaPath = path.join(dir, "schema.ts");
			writeFileSync(
				schemaPath,
				`
          import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

          export const users = sqliteTable('users', {
            id: text('id').primaryKey(),
            name: text('name').notNull(),
            email: text('email').notNull().unique(),
            departmentId: text('dept_id').references(() => departments.id),
          }, (table) => ({
            usersEmailIdx: index('users_email_idx').on(table.email),
          }));

          export const departments = sqliteTable('departments', {
            id: text('id').primaryKey(),
            name: text('name').notNull(),
            managerId: text('manager_id').references(() => users.id),
          });

          export const posts = sqliteTable('posts', {
            id: text('id').primaryKey(),
            userId: text('user_id').notNull().references(() => users.id),
            title: text('title').notNull(),
            status: text('status').notNull(),
          });

          export const comments = sqliteTable('comments', {
            id: text('id').primaryKey(),
            postId: text('post_id').notNull().references(() => posts.id),
            userId: text('user_id').notNull().references(() => users.id),
            body: text('body'),
          });

          export const likes = sqliteTable('likes', {
            id: text('id').primaryKey(),
            userId: text('user_id').notNull().references(() => users.id),
            postId: text('post_id').notNull().references(() => posts.id),
            commentId: text('comment_id').references(() => comments.id),
          }, (table) => ({
            likesUserPostIdx: index('likes_user_post_idx').on(table.userId, table.postId),
          }));
        `,
			);

			const scanner = new SchemaScanner(schemaPath);
			const tables = scanner.scan();

			expect(Object.keys(tables)).toEqual(["users", "departments", "posts", "comments", "likes"]);

			// Users
			expect(tables.users.columns.name.dataType).toBe("text");
			expect(tables.users.columns.departmentId.references).toBe("() => departments.id");
			expect(tables.users.relations).toContain("() => departments.id");
			expect(tables.users.indexes).toContain("usersEmailIdx");

			// Departments
			expect(tables.departments.columns.name.dataType).toBe("text");
			expect(tables.departments.columns.managerId.references).toBe("() => users.id");
			expect(tables.departments.relations).toContain("() => users.id");

			// Posts
			expect(tables.posts.columns.userId.references).toBe("() => users.id");
			expect(tables.posts.relations).toContain("() => users.id");
			expect(tables.posts.columns.status.dataType).toBe("text");

			// Comments (references both posts and users)
			expect(tables.comments.columns.postId.references).toBe("() => posts.id");
			expect(tables.comments.columns.userId.references).toBe("() => users.id");
			expect(tables.comments.relations).toContain("() => posts.id");
			expect(tables.comments.relations).toContain("() => users.id");

			// Likes (references users, posts, and comments)
			expect(tables.likes.columns.userId.references).toBe("() => users.id");
			expect(tables.likes.columns.postId.references).toBe("() => posts.id");
			expect(tables.likes.columns.commentId.references).toBe("() => comments.id");
			expect(tables.likes.relations).toContain("() => users.id");
			expect(tables.likes.relations).toContain("() => posts.id");
			expect(tables.likes.relations).toContain("() => comments.id");
			expect(tables.likes.indexes).toContain("likesUserPostIdx");
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
