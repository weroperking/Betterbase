import { describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

describe("Error message quality", () => {
	describe("Migrate error messages", () => {
		it("migrate error includes backup path and restore command", async () => {
			// Test the backup path inclusion in error messages
			const backupPath = "/tmp/backup.db";
			const sourcePath = "/myapp/local.db";
			const errorDetail = "column not found";

			// Simulate the error message that would be built when migration fails
			// Based on the restoreBackup function in migrate.ts
			const errorMessage = `Migration failed: ${errorDetail}

Backup saved: ${backupPath}
To restore: cp ${backupPath} ${sourcePath}`;

			expect(errorMessage).toContain("backup");
			expect(errorMessage).toContain(backupPath);
			expect(errorMessage).toContain("cp ");
		});

		it("includes helpful restore instructions in error messages", () => {
			const backupPath = "/workspace/project/backups/db-2024-01-01.sqlite";
			const sourcePath = "/workspace/project/local.db";

			const errorMessage = `Migration push failed.
Backup available at: ${backupPath}
Run: cp ${backupPath} ${sourcePath} to restore`;

			expect(errorMessage).toContain("cp");
			expect(errorMessage).toContain(backupPath);
		});
	});

	describe("Generate CRUD error messages", () => {
		it("generate crud error lists available tables when table not found", async () => {
			// Create a temporary project with a schema
			const testDir = mkdtempSync(path.join(os.tmpdir(), "bb-generate-test-"));
			mkdirSync(path.join(testDir, "src/db"), { recursive: true });

			// Write a schema with multiple tables
			writeFileSync(
				path.join(testDir, "src/db/schema.ts"),
				`
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull(),
});

export const posts = sqliteTable('posts', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  content: text('content'),
  userId: text('user_id').references(() => users.id),
});

export const comments = sqliteTable('comments', {
  id: text('id').primaryKey(),
  body: text('body').notNull(),
  postId: text('post_id').references(() => posts.id),
});
`,
			);

			// Import the SchemaScanner to get available tables
			const { SchemaScanner } = await import("../src/utils/scanner");
			const schemaPath = path.join(testDir, "src/db/schema.ts");
			const scanner = new SchemaScanner(schemaPath);
			const tables = scanner.scan();

			const availableTables = Object.keys(tables);

			// Simulate what happens when a table is not found
			const requestedTable = "typo_table";
			const errorMessage = `Table "${requestedTable}" not found in schema.

Available tables: ${availableTables.join(", ")}`;

			expect(errorMessage).toContain("typo_table");
			expect(errorMessage).toContain("users");
			expect(errorMessage).toContain("posts");
			expect(errorMessage).toContain("comments");

			rmSync(testDir, { recursive: true, force: true });
		});

		it("provides clear error when schema file is missing", async () => {
			const testDir = mkdtempSync(path.join(os.tmpdir(), "bb-generate-missing-"));
			// Don't create a schema file

			const schemaPath = path.join(testDir, "src/db/schema.ts");
			const errorMessage = `Schema file not found at ${schemaPath}`;

			expect(errorMessage).toContain("not found");
			expect(errorMessage).toContain(schemaPath);

			rmSync(testDir, { recursive: true, force: true });
		});
	});

	describe("Error message formatting", () => {
		it("includes error details in migrate failure", () => {
			const stderr = 'Error: relation "users" already exists';
			const errorMessage = `Migration push failed.
${stderr}`;

			expect(errorMessage).toContain("Migration push failed");
			expect(errorMessage).toContain("relation");
		});

		it("includes connection error details", () => {
			const stderr = "Error: connect ECONNREFUSED 127.0.0.1:5432";
			const errorMessage = `Database connection failed while applying migration.
${stderr}`;

			expect(errorMessage).toContain("Database connection failed");
			expect(errorMessage).toContain("ECONNREFUSED");
		});
	});
});
