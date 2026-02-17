import { HTTPException } from 'hono/http-exception';
import type { ZodType } from 'zod';
import { z } from 'zod';

/**
 * Validate and parse an input value against a Zod schema.
 *
 * @param schema - Zod schema to validate and parse the input into type `T`
 * @param body - The value to validate
 * @returns The validated and parsed value as type `T`
 * @throws HTTPException with status 400 when validation fails. The exception payload contains `message: "Validation failed"` and `cause.errors`, an array of objects each with `path` (dot-joined string), `message`, and `code`
 */
export function parseBody<T>(schema: ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);

  if (!result.success) {
    throw new HTTPException(400, {
      message: 'Validation failed',
      cause: {
        errors: result.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
          code: issue.code,
        })),
      },
    });
  }

  return result.data;
}

// TODO: Placeholder schema for scaffolded user-creation routes.
export const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
});