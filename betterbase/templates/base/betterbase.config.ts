import { z } from 'zod';

export const BetterBaseConfigSchema = z.object({
  mode: z.enum(['local', 'neon', 'turso']),
  database: z.object({
    local: z.string(),
    production: z.string().nullable().optional(),
  }),
  auth: z.object({
    enabled: z.boolean(),
  }),
});

export type BetterBaseConfig = z.infer<typeof BetterBaseConfigSchema>;

export const betterbaseConfig: BetterBaseConfig = BetterBaseConfigSchema.parse({
  mode: 'local',
  database: {
    local: 'local.db',
    production: null,
  },
  auth: {
    enabled: true,
  },
});
