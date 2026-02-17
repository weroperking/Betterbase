import { Hono } from 'hono';
import { authRoute } from './routes/auth';

const app = new Hono();
app.route('/auth', authRoute);

export default {
  port: Number(process.env.PORT ?? 3000),
  fetch: app.fetch,
};
