import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { db } from '../db';

export const healthRoute = new Hono();

healthRoute.get('/', async (c) => {
  try {
    await db.run(sql`select 1`);

    return c.json({
      status: 'healthy',
      database: 'connected',
      timestamp: new Date().toISOString(),
    });
  } catch {
    return c.json(
      {
        status: 'unhealthy',
        database: 'disconnected',
        timestamp: new Date().toISOString(),
      },
      503,
    );
  }
});
