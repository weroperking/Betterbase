import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';

try {
  const sqlite = new Database(process.env.DB_PATH ?? 'local.db', { create: true });
  const db = drizzle(sqlite);

  migrate(db, { migrationsFolder: './drizzle' });
  console.log('Migrations applied successfully.');
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error('Failed to apply migrations:', message);
  process.exit(1);
}
