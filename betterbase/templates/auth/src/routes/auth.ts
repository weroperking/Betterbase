import { Hono } from 'hono';

export const authRoute = new Hono();

authRoute.get('/health', (c) => {
  return c.json({ status: 'ok', feature: 'auth-template' });
});
