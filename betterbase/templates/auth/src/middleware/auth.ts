import { createMiddleware } from 'hono/factory';

export const authMiddleware = createMiddleware(async (_c, next) => {
  // TODO: Wire BetterAuth session checks into the auth template.
  await next();
});
