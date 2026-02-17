import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { db } from '../db';
import { users } from '../db/schema';
import { parseBody } from '../middleware/validation';

export const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
});

export const usersRoute = new Hono();

usersRoute.get('/', async (c) => {
  const allUsers = await db.select().from(users);
  return c.json({ users: allUsers });
});

usersRoute.post('/', async (c) => {
  try {
    const body = await c.req.json();
    const parsed = parseBody(createUserSchema, body);

    // TODO: persist parsed user via db.insert(users) or a dedicated UsersService.
    return c.json({
      message: 'User payload validated (not persisted)',
      user: parsed,
    });
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }

    if (error instanceof SyntaxError) {
      throw new HTTPException(400, { message: 'Malformed JSON body' });
    }

    throw error;
  }
});
