import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Adds created_at and updated_at timestamp columns.
 * created_at is set on insert and updated_at is refreshed on updates.
 * Note: .$onUpdate(() => new Date()) applies when updates go through Drizzle.
 * Raw SQL writes will not auto-update this value without a DB trigger.
 *
 * @example
 * export const users = sqliteTable('users', {
 *   id: uuid(),
 *   email: text('email'),
 *   ...timestamps,
 * });
 */
export const timestamps = {
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .$defaultFn(() => new Date())
    .$onUpdate(() => new Date()),
};

/**
 * UUID primary-key helper.
 */
export const uuid = (name = 'id') =>
  text(name)
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

/**
 * Soft-delete helper.
 */
export const softDelete = {
  deletedAt: integer('deleted_at', { mode: 'timestamp' }),
};

/**
 * Shared status enum helper.
 */
export const statusEnum = (name = 'status') =>
  text(name, { enum: ['active', 'inactive', 'pending'] }).default('active');

/**
 * Currency helper stored as integer cents.
 */
export const moneyColumn = (name: string) => integer(name).notNull().default(0);

/**
 * JSON text helper with type support.
 */
export const jsonColumn = <T>(name: string) => text(name, { mode: 'json' }).$type<T>();

export const users = sqliteTable('users', {
  id: uuid(),
  email: text('email').notNull().unique(),
  name: text('name'),
  status: statusEnum(),
  ...timestamps,
  ...softDelete,
});

export const posts = sqliteTable('posts', {
  id: uuid(),
  title: text('title').notNull(),
  content: text('content'),
  userId: text('user_id').references(() => users.id),
  ...timestamps,
});
