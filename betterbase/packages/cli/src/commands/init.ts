import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import * as logger from '../utils/logger';
import * as prompts from '../utils/prompts';

const projectNameSchema = z
  .string()
  .trim()
  .min(1)
  .regex(/^[a-zA-Z0-9-_]+$/, 'Project name can only contain letters, numbers, hyphens, and underscores.');

const initOptionsSchema = z.object({
  projectName: projectNameSchema.optional(),
});

const databaseModeSchema = z.enum(['local', 'neon', 'turso']);

type DatabaseMode = z.infer<typeof databaseModeSchema>;

export type InitCommandOptions = z.infer<typeof initOptionsSchema>;

function getDatabaseLabel(databaseMode: DatabaseMode): string {
  if (databaseMode === 'neon') {
    return 'Neon (serverless Postgres)';
  }

  if (databaseMode === 'turso') {
    return 'Turso (edge SQLite)';
  }

  return 'SQLite (local.db)';
}

async function installDependencies(projectPath: string): Promise<void> {
  const installProcess = Bun.spawn(['bun', 'install'], {
    cwd: projectPath,
    stdout: 'inherit',
    stderr: 'inherit',
  });

  const exitCode = await installProcess.exited;

  if (exitCode !== 0) {
    throw new Error('Dependency installation failed. Please run `bun install` manually.');
  }
}

async function initializeGitRepository(projectPath: string): Promise<void> {
  const gitProcess = Bun.spawn(['git', 'init'], {
    cwd: projectPath,
    stdout: 'ignore',
    stderr: 'ignore',
  });

  const exitCode = await gitProcess.exited;

  if (exitCode !== 0) {
    logger.warn('Git initialization failed. You can run `git init` manually.');
  }
}

function buildPackageJson(projectName: string, databaseMode: DatabaseMode, useAuth: boolean): string {
  const dependencies: Record<string, string> = {
    hono: '^4.11.9',
    'drizzle-orm': '^0.44.5',
    zod: '^3.25.76',
  };

  if (databaseMode === 'turso') {
    dependencies['@libsql/client'] = '^0.14.0';
  }

  if (databaseMode === 'neon') {
    dependencies.pg = '^8.13.1';
  }

  if (useAuth) {
    dependencies['better-auth'] = '^1.1.15';
  }

  const json = {
    name: projectName,
    private: true,
    type: 'module',
    scripts: {
      dev: 'bun run src/index.ts',
      'db:generate': 'drizzle-kit generate',
      'db:push': 'bun run src/db/migrate.ts',
    },
    dependencies,
    devDependencies: {
      '@types/bun': '^1.3.9',
      'drizzle-kit': '^0.31.4',
      typescript: '^5.9.3',
    },
  };

  return `${JSON.stringify(json, null, 2)}\n`;
}

function buildDrizzleConfig(databaseMode: DatabaseMode): string {
  const dialect: Record<DatabaseMode, 'sqlite' | 'postgresql' | 'turso'> = {
    local: 'sqlite',
    neon: 'postgresql',
    turso: 'turso',
  };

  const databaseUrl: Record<DatabaseMode, string> = {
    local: "process.env.DATABASE_URL || 'file:local.db'",
    neon: "process.env.DATABASE_URL || 'postgres://localhost'",
    turso: "process.env.DATABASE_URL || 'libsql://localhost'",
  };

  const tursoAuthTokenLine = databaseMode === 'turso' ? "\n    authToken: process.env.TURSO_AUTH_TOKEN || ''," : '';

  return `import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: '${dialect[databaseMode]}',
  dbCredentials: {
    url: ${databaseUrl[databaseMode]},${tursoAuthTokenLine}
  },
});
`;
}

async function buildSchema(databaseMode: DatabaseMode): Promise<string> {
  if (databaseMode === 'neon') {
    return `import { integer, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: integer('id').generatedAlwaysAsIdentity().primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 255 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
`;
  }

  return `import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Adds created_at and updated_at timestamp columns.
 * Note: .$onUpdate(() => new Date()) runs when updates go through Drizzle.
 * For raw SQL writes, add a DB trigger if you need automatic updated_at changes.
 */
export const timestamps = {
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .$defaultFn(() => new Date())
    .$onUpdate(() => new Date()),
};

/**
 * UUID primary-key helper.
 */
export const uuid = (name = 'id') =>
  text(name)
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

/**
 * Soft-delete helper.
 */
export const softDelete = {
  deletedAt: integer('deleted_at', { mode: 'timestamp' }),
};

/**
 * Shared status enum helper.
 */
export const statusEnum = (name = 'status') =>
  text(name, { enum: ['active', 'inactive', 'pending'] }).default('active');

/**
 * Currency helper stored as integer cents.
 */
export const moneyColumn = (name: string) => integer(name).notNull().default(0);

/**
 * JSON text helper with type support.
 */
export const jsonColumn = <T>(name: string) => text(name, { mode: 'json' }).$type<T>();

export const users = sqliteTable('users', {
  id: uuid(),
  email: text('email').notNull().unique(),
  name: text('name'),
  status: statusEnum(),
  ...timestamps,
  ...softDelete,
});

export const posts = sqliteTable('posts', {
  id: uuid(),
  title: text('title').notNull(),
  content: text('content'),
  userId: text('user_id').references(() => users.id),
  ...timestamps,
});
`;
}

function buildMigrateScript(databaseMode: DatabaseMode): string {
  if (databaseMode === 'neon') {
    return `import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const db = drizzle(pool);

try {
  await migrate(db, { migrationsFolder: './drizzle' });
  console.log('Migrations applied successfully.');
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error('Failed to apply migrations:', message);
  process.exit(1);
} finally {
  await pool.end();
}
`;
  }

  if (databaseMode === 'turso') {
    return `import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';

const client = createClient({
  url: process.env.DATABASE_URL || 'file:local.db',
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const db = drizzle(client);

try {
  await migrate(db, { migrationsFolder: './drizzle' });
  console.log('Migrations applied successfully.');
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error('Failed to apply migrations:', message);
  process.exit(1);
}
`;
  }

  return `import { Database } from 'bun:sqlite';
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
`;
}

function buildDbIndex(databaseMode: DatabaseMode): string {
  if (databaseMode === 'neon') {
    return `import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export const db = drizzle(pool, { schema });
`;
  }

  if (databaseMode === 'turso') {
    return `import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from './schema';

const client = createClient({
  url: process.env.DATABASE_URL || 'file:local.db',
  authToken: process.env.TURSO_AUTH_TOKEN,
});

export const db = drizzle(client, { schema });
`;
  }

  return `import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import * as schema from './schema';

const client = new Database(process.env.DB_PATH ?? 'local.db', { create: true });

export const db = drizzle(client, { schema });
`;
}

function buildAuthMiddleware(): string {
  return `import { createMiddleware } from 'hono/factory';

export const authMiddleware = createMiddleware(async (_c, next) => {
  // TODO: wire BetterAuth session validation.
  await next();
});
`;
}

function buildReadme(projectName: string): string {
  return `# ${projectName}

Generated with BetterBase CLI.

## Scripts

- \`bun run dev\`
- \`bun run db:generate\`
- \`bun run db:push\`
`;
}

function buildRoutesIndex(): string {
  return `import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { HTTPException } from 'hono/http-exception';
import { healthRoute } from './health';
import { usersRoute } from './users';

export default function registerRoutes(app: Hono): void {
  app.use('*', cors());
  app.use('*', logger());

  app.onError((err, c) => {
    const isHttpError = err instanceof HTTPException;
    const showDetailedError = process.env.NODE_ENV === 'development' || isHttpError;

    return c.json(
      {
        error: showDetailedError ? err.message : 'Internal Server Error',
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
        details: isHttpError ? (err as { cause?: unknown }).cause ?? null : null,
      },
      isHttpError ? err.status : 500,
    );
  });

  app.route('/health', healthRoute);
  app.route('/api/users', usersRoute);
}
`;
}

async function writeProjectFiles(
  projectPath: string,
  projectName: string,
  databaseMode: DatabaseMode,
  useAuth: boolean,
): Promise<void> {
  await mkdir(path.join(projectPath, 'src/db'), { recursive: true });
  await mkdir(path.join(projectPath, 'src/routes'), { recursive: true });
  await mkdir(path.join(projectPath, 'src/middleware'), { recursive: true });
  await mkdir(path.join(projectPath, 'src/lib'), { recursive: true });

  await writeFile(
    path.join(projectPath, 'betterbase.config.ts'),
    `export default {
  mode: '${databaseMode}',
  database: {
    local: 'local.db',
    production: process.env.DATABASE_URL,
  },
  auth: {
    enabled: ${useAuth},
  },
};
`,
  );

  await writeFile(path.join(projectPath, 'drizzle.config.ts'), buildDrizzleConfig(databaseMode));
  await writeFile(path.join(projectPath, 'package.json'), buildPackageJson(projectName, databaseMode, useAuth));

  await writeFile(
    path.join(projectPath, 'tsconfig.json'),
    `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "types": ["bun"],
    "skipLibCheck": true
  },
  "include": ["src/**/*.ts", "drizzle.config.ts", "betterbase.config.ts"]
}
`,
  );

  await writeFile(
    path.join(projectPath, '.env.example'),
    `DATABASE_URL=
DB_PATH=local.db
TURSO_AUTH_TOKEN=
NODE_ENV=development
PORT=3000
`,
  );

  await writeFile(
    path.join(projectPath, '.gitignore'),
    `node_modules
bun.lockb
.env
.env.*
!.env.example
local.db
.drizzle
`,
  );

  await writeFile(path.join(projectPath, 'README.md'), buildReadme(projectName));
  await writeFile(path.join(projectPath, 'src/db/schema.ts'), await buildSchema(databaseMode));
  await writeFile(path.join(projectPath, 'src/db/index.ts'), buildDbIndex(databaseMode));

  await writeFile(path.join(projectPath, 'src/db/migrate.ts'), buildMigrateScript(databaseMode));

  await writeFile(
    path.join(projectPath, 'src/routes/health.ts'),
    `import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { db } from '../db';

export const healthRoute = new Hono();

healthRoute.get('/', async (c) => {
  try {
    await db.run(sql\`select 1\`);

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
`,
  );

  await writeFile(
    path.join(projectPath, 'src/middleware/validation.ts'),
    `import { HTTPException } from 'hono/http-exception';
import type { ZodType } from 'zod';

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
`,
  );

  await writeFile(
    path.join(projectPath, 'src/routes/users.ts'),
    `import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { db } from '../db';
import { users } from '../db/schema';
import { parseBody } from '../middleware/validation';

const createUserSchema = z.object({
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
`,
  );

  await writeFile(path.join(projectPath, 'src/routes/index.ts'), buildRoutesIndex());

  await writeFile(
    path.join(projectPath, 'src/index.ts'),
    `import { Hono } from 'hono';
import registerRoutes from './routes';

const app = new Hono();
registerRoutes(app);

const server = Bun.serve({
  fetch: app.fetch,
  port: Number(process.env.PORT ?? 3000),
  development: process.env.NODE_ENV === 'development',
});

console.log(\`🚀 Server running at http://localhost:\${server.port}\`);
for (const route of app.routes) {
  console.log(\`  \${route.method} \${route.path}\`);
}

process.on('SIGTERM', () => {
  server.stop();
});

process.on('SIGINT', () => {
  server.stop();
});

export default server;
`,
  );

  await writeFile(
    path.join(projectPath, 'src/lib/utils.ts'),
    `export function notImplemented(feature: string): never {
  throw new Error(\`\${feature} is not implemented yet.\`);
}
`,
  );

  if (useAuth) {
    await writeFile(path.join(projectPath, 'src/middleware/auth.ts'), buildAuthMiddleware());
  }
}

/**
 * Run the `bb init` command.
 */
export async function runInitCommand(rawOptions: InitCommandOptions): Promise<void> {
  const options = initOptionsSchema.parse(rawOptions);

  const projectNameInput =
    options.projectName ??
    (await prompts.text({
      message: 'What is your project name?',
      initial: 'my-betterbase-app',
    }));

  const projectName = projectNameSchema.parse(projectNameInput);
  const projectPath = path.resolve(process.cwd(), projectName);

  const databaseMode = databaseModeSchema.parse(
    await prompts.select({
      message: 'Choose your database setup:',
      initial: 'local',
      choices: [
        { name: 'Local SQLite (development only)', value: 'local' },
        { name: 'Connect to Neon (serverless Postgres)', value: 'neon' },
        { name: 'Connect to Turso (edge SQLite)', value: 'turso' },
      ],
    }),
  );

  const useAuth = await prompts.confirm({
    message: 'Add authentication? (yes/no)',
    initial: true,
  });

  const useGit = await prompts.confirm({
    message: 'Initialize git repository? (yes/no)',
    initial: true,
  });

  let createdProjectDir = false;

  try {
    await mkdir(projectPath);
    createdProjectDir = true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | undefined)?.code;
    if (code === 'EEXIST') {
      throw new Error(`Directory \`${projectName}\` already exists. Choose another project name.`);
    }

    const message = error instanceof Error ? error.message : 'Unknown directory creation error';
    throw new Error(`Failed to create project directory: ${message}`);
  }

  try {
    logger.info('Creating project files...');
    await writeProjectFiles(projectPath, projectName, databaseMode, useAuth);

    logger.info('Installing dependencies with bun...');
    await installDependencies(projectPath);

    if (useGit) {
      logger.info('Initializing git repository...');
      await initializeGitRepository(projectPath);
    }

    logger.success('BetterBase project created successfully!');
    console.log('');
    console.log(`📁 Project: ${projectName}`);
    console.log(`🗄️  Database: ${getDatabaseLabel(databaseMode)}`);
    console.log(`🔐 Auth: ${useAuth ? 'Enabled' : 'Disabled'}`);
    console.log('');
    console.log('Next steps:');
    console.log(`  cd ${projectName}`);
    console.log('  bun run dev');
    console.log('');
    console.log('Your backend is running at http://localhost:3000');
  } catch (error) {
    if (createdProjectDir) {
      try {
        await rm(projectPath, { recursive: true, force: true });
      } catch (cleanupError) {
        const cleanupMessage = cleanupError instanceof Error ? cleanupError.message : String(cleanupError);
        logger.warn(`Failed to cleanup \`${projectName}\`: ${cleanupMessage}`);
      }
    }

    throw error;
  }
}
