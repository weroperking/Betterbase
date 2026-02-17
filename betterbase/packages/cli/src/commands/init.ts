import { mkdir, writeFile } from 'node:fs/promises';
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

/**
 * Get a human-readable label for a chosen database mode.
 *
 * @param databaseMode - The database mode; one of 'local', 'neon', or 'turso'
 * @returns The label: `'Neon (serverless Postgres)'` for `'neon'`, `'Turso (edge SQLite)'` for `'turso'`, or `'SQLite (local.db)'` for `'local'` and other values
 */
function getDatabaseLabel(databaseMode: DatabaseMode): string {
  if (databaseMode === 'neon') {
    return 'Neon (serverless Postgres)';
  }

  if (databaseMode === 'turso') {
    return 'Turso (edge SQLite)';
  }

  return 'SQLite (local.db)';
}

/**
 * Installs project dependencies in the specified project directory using Bun.
 *
 * @param projectPath - File system path to the project directory where dependencies will be installed
 * @throws Error if the install process exits with a non-zero code; message suggests running `bun install` manually
 */
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

/**
 * Initializes a Git repository inside the specified project directory.
 *
 * Attempts to run `git init` in the provided path and logs a warning if initialization fails.
 *
 * @param projectPath - Filesystem path of the project directory where the repository should be initialized
 */
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

/**
 * Build the contents of a package.json tailored to the chosen project settings.
 *
 * The generated package JSON includes the project name, `private: true`, `"type": "module"`, standard scripts for development and Drizzle, a `dependencies` object that varies by `databaseMode` and `useAuth`, and a set of `devDependencies`.
 *
 * @param projectName - The package `name` field to use in package.json
 * @param databaseMode - The selected database mode; determines which database client dependency is included
 * @param useAuth - Whether to include the authentication library dependency
 * @returns A pretty-printed JSON string representing the package.json contents (with a trailing newline)
 */
function buildPackageJson(projectName: string, databaseMode: DatabaseMode, useAuth: boolean): string {
  const dependencies: Record<string, string> = {
    hono: '^4.11.9',
    'drizzle-orm': '^0.36.4',
    zod: '^3.25.76',
  };

  if (databaseMode === 'local') {
    dependencies['better-sqlite3'] = '^11.7.0';
  }

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
      'db:push': 'drizzle-kit push',
    },
    dependencies,
    devDependencies: {
      '@types/bun': '^1.3.9',
      'drizzle-kit': '^0.27.2',
      typescript: '^5.9.3',
    },
  };

  return `${JSON.stringify(json, null, 2)}\n`;
}

/**
 * Builds the content of a drizzle.config.ts file configured for the given database mode.
 *
 * @param databaseMode - The selected database mode ('local', 'neon', or 'turso') used to choose the Drizzle dialect
 * @returns The TypeScript source for a Drizzle configuration that sets schema path, output directory, chosen dialect, and `dbCredentials.url` (falling back to `file:local.db`)
 */
function buildDrizzleConfig(databaseMode: DatabaseMode): string {
  const dialect: Record<DatabaseMode, 'sqlite' | 'postgresql' | 'turso'> = {
    local: 'sqlite',
    neon: 'postgresql',
    turso: 'turso',
  };

  return `import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: '${dialect[databaseMode]}',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'file:local.db',
  },
});
`;
}

/**
 * Produce the TypeScript source for a Drizzle ORM `users` schema tailored to the chosen database mode.
 *
 * @param databaseMode - The target database mode (`'local'`, `'neon'`, or `'turso'`) used to select the appropriate dialect and schema shape
 * @returns A string containing the generated TypeScript schema file content for a `users` table compatible with the selected database dialect
 */
function buildSchema(databaseMode: DatabaseMode): string {
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

  return `import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull().unique(),
  name: text('name'),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});
`;
}

/**
 * Generate the TypeScript source for a database index module configured for the specified database mode.
 *
 * @param databaseMode - The target database mode: `'local'` produces a Bun SQLite client, `'neon'` produces a node-postgres Pool with Drizzle, and `'turso'` produces a @libsql/client with Drizzle.
 * @returns The source code string of a module that initializes and exports a configured `db` instance wired to the generated `schema`.
 */
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
});

export const db = drizzle(client, { schema });
`;
  }

  return `import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import * as schema from './schema';

const client = new Database('local.db', { create: true });

export const db = drizzle(client, { schema });
`;
}

/**
 * Generate TypeScript source for a minimal Hono authentication middleware placeholder.
 *
 * @returns A string containing TypeScript source that exports `authMiddleware` as a Hono middleware which currently forwards requests (`await next()`) and includes a `TODO` comment to implement session validation.
 */
function buildAuthMiddleware(): string {
  return `import { createMiddleware } from 'hono/factory';

export const authMiddleware = createMiddleware(async (_c, next) => {
  // TODO: wire BetterAuth session validation.
  await next();
});
`;
}

/**
 * Generate README.md content for a new project.
 *
 * @returns The README content string including the project title and recommended Bun scripts: `bun run dev`, `bun run db:generate`, and `bun run db:push`.
 */
function buildReadme(projectName: string): string {
  return `# ${projectName}

Generated with BetterBase CLI.

## Scripts

- \`bun run dev\`
- \`bun run db:generate\`
- \`bun run db:push\`
`;
}

/**
 * Scaffold a new project at the given path by creating directories and writing generated configuration, source, and helper files according to the chosen database mode and authentication option.
 *
 * @param projectPath - Filesystem path where the project will be created
 * @param projectName - Name used in the generated package.json and README
 * @param databaseMode - Selected database mode used to tailor DB config, schema, and wiring (`local`, `neon`, or `turso`)
 * @param useAuth - Include authentication middleware and related configuration when true
 */
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
    local: 'sqlite://local.db',
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
    "noImplicitAny": true,
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
NODE_ENV=development
PORT=3000
`,
  );

  await writeFile(
    path.join(projectPath, '.gitignore'),
    `node_modules
bun.lockb
.env
local.db
.drizzle
`,
  );

  await writeFile(path.join(projectPath, 'README.md'), buildReadme(projectName));

  await writeFile(path.join(projectPath, 'src/db/schema.ts'), buildSchema(databaseMode));

  await writeFile(path.join(projectPath, 'src/db/index.ts'), buildDbIndex(databaseMode));

  await writeFile(
    path.join(projectPath, 'src/routes/health.ts'),
    `import { Hono } from 'hono';

export const healthRoute = new Hono();

healthRoute.get('/', (c) => {
  return c.json({
    status: 'healthy',
    database: 'connected',
    timestamp: new Date().toISOString(),
  });
});
`,
  );

  await writeFile(
    path.join(projectPath, 'src/routes/index.ts'),
    `import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { HTTPException } from 'hono/http-exception';
import { db } from '../db';
import { users } from '../db/schema';
import { healthRoute } from './health';

const app = new Hono();

app.use('*', cors());
app.use('*', logger());
app.use('*', async (c, next) => {
  const start = performance.now();
  await next();
  const duration = (performance.now() - start).toFixed(2);
  console.log(\`⏱ \${c.req.method} \${c.req.path} - \${duration}ms\`);
});

app.onError((err, c) => {
  console.error('Error:', err);
  return c.json(
    {
      error: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
      details: err instanceof HTTPException ? (err as { cause?: unknown }).cause ?? null : null,
    },
    err instanceof HTTPException ? err.status : 500,
  );
});

app.route('/health', healthRoute);

app.get('/api/users', async (c) => {
  const allUsers = await db.select().from(users);
  return c.json({ users: allUsers });
});

const server = Bun.serve({
  fetch: app.fetch,
  port: Number(process.env.PORT ?? 3000),
  development: process.env.NODE_ENV === 'development',
});

console.log('\x1b[32m🚀 BetterBase dev server started\x1b[0m');
console.log(\`\x1b[36m→ URL:\x1b[0m http://localhost:\${server.port}\`);
console.log('\x1b[35m→ Routes:\x1b[0m');
console.log('  GET /health');
console.log('  GET /api/users');

process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing server...');
  server.stop();
});

process.on('SIGINT', () => {
  console.log('SIGINT received, closing server...');
  server.stop();
});
`,
  );

  await writeFile(
    path.join(projectPath, 'src/index.ts'),
    `import server from './routes/index';

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
 * Scaffolds a new BetterBase project by prompting for options, creating files, installing dependencies, and optionally initializing git.
 *
 * @param rawOptions - Partial CLI options used to pre-fill prompts (e.g., `projectName`)
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

  try {
    await mkdir(projectPath);
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
    const message = error instanceof Error ? error.message : 'Unknown init error';
    throw new Error(`Failed to initialize project: ${message}`);
  }
}