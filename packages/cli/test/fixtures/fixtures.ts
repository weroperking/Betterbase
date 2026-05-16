import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

export interface TestProject {
  root: string;
  cleanup: () => void;
}

export function createTestProject(files?: Record<string, string>): TestProject {
  const root = join(tmpdir(), `bb-test-${randomUUID().slice(0, 8)}`);
  mkdirSync(root, { recursive: true });

  if (files) {
    for (const [relPath, content] of Object.entries(files)) {
      const absPath = join(root, relPath);
      mkdirSync(join(absPath, ".."), { recursive: true });
      writeFileSync(absPath, content);
    }
  }

  return {
    root,
    cleanup: () => {
      try { rmSync(root, { recursive: true, force: true }); } catch { /* ignore */ }
    },
  };
}

export function createMinimalSchema(): string {
  return `
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  age: integer("age"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const posts = sqliteTable("posts", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  content: text("content"),
  userId: text("user_id").references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});
`;
}

export function createMinimalConfig(overrides?: Record<string, unknown>): string {
  return `
import { defineConfig } from "@betterbase/core";

export default defineConfig({
  project: { name: "test-project" },
  ${overrides ? JSON.stringify(overrides, null, 2).slice(1, -1) : ""}
});
`;
}

export const SIMPLE_SCHEMA = createMinimalSchema();

export const MULTI_TABLE_SCHEMA = `
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
});

export const posts = sqliteTable('posts', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  content: text('content'),
  userId: text('user_id').notNull().references(() => users.id),
  published: integer('published', { mode: 'boolean' }).default(0),
});

export const comments = sqliteTable('comments', {
  id: text('id').primaryKey(),
  body: text('body').notNull(),
  postId: text('post_id').notNull().references(() => posts.id),
  userId: text('user_id').notNull().references(() => users.id),
});
`;
