import { Database } from "bun:sqlite";

export interface TestDatabase {
  db: Database;
  cleanup: () => void;
}

export function createTestDatabase(): TestDatabase {
  const db = new Database(":memory:");

  db.run(`
    CREATE TABLE IF NOT EXISTS _betterbase_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      checksum TEXT NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS _betterbase_webhook_deliveries (
      id TEXT PRIMARY KEY,
      webhook_id TEXT NOT NULL,
      status TEXT NOT NULL,
      request_url TEXT,
      response_code INTEGER,
      response_body TEXT,
      error TEXT,
      attempt_count INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  return {
    db,
    cleanup: () => db.close(),
  };
}

export function seedMigrationTracking(
  db: Database,
  migrations: { name: string; checksum: string }[],
): void {
  const stmt = db.prepare(
    "INSERT INTO _betterbase_migrations (name, checksum) VALUES (?, ?)",
  );
  for (const m of migrations) {
    stmt.run(m.name, m.checksum);
  }
}

export function seedWebhookDeliveries(
  db: Database,
  deliveries: {
    id: string;
    webhook_id: string;
    status: string;
    response_code?: number;
    error?: string;
  }[],
): void {
  const stmt = db.prepare(
    `INSERT INTO _betterbase_webhook_deliveries
     (id, webhook_id, status, response_code, error, attempt_count)
     VALUES (?, ?, ?, ?, ?, 1)`,
  );
  for (const d of deliveries) {
    stmt.run(d.id, d.webhook_id, d.status, d.response_code ?? null, d.error ?? null);
  }
}
