import { Hono } from 'hono';
import { registerRoutes } from './routes';

const app = new Hono();
registerRoutes(app);

const server = Bun.serve({
  fetch: app.fetch,
  port: Number(process.env.PORT ?? 3000),
  development: process.env.NODE_ENV === 'development',
});

console.log(`🚀 Server running at http://localhost:${server.port}`);
for (const route of app.routes) {
  console.log(`  ${route.method} ${route.path}`);
}

process.on('SIGTERM', () => {
  server.stop();
});

process.on('SIGINT', () => {
  server.stop();
});

export { app, server };
