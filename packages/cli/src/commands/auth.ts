import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import * as logger from "../utils/logger";
import { confirm } from "../utils/prompts";
import { getAvailableProviders, getProviderTemplate } from "./auth-providers";

const AUTH_INSTANCE_FILE = (provider: string) => `import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { db } from "../db"
import * as schema from "../db/auth-schema"

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "${provider}",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
  },
  secret: process.env.AUTH_SECRET,
  baseURL: process.env.AUTH_URL ?? "http://localhost:3000",
  trustedOrigins: [process.env.AUTH_URL ?? "http://localhost:3000"],
  plugins: [],
})

export type Auth = typeof auth
`;

const AUTH_TYPES_FILE = `import type { auth } from "./index"

export type Session = typeof auth.$Infer.Session.session
export type User = typeof auth.$Infer.Session.user

export type AuthVariables = {
  user: User
  session: Session
}
`;

const AUTH_MIDDLEWARE_FILE = `import { auth } from "../auth"
import type { Context, Next } from "hono"

export async function requireAuth(c: Context, next: Next) {
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  })
  if (!session) {
    return c.json({ data: null, error: "Unauthorized" }, 401)
  }
  c.set("user", session.user)
  c.set("session", session.session)
  await next()
}

export async function optionalAuth(c: Context, next: Next) {
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  })
  if (session) {
    c.set("user", session.user)
    c.set("session", session.session)
  }
  await next()
}

export function getAuthUser(c: Context) {
  return c.get("user")
}

export function isAuthenticated(c: Context): boolean {
  return !!c.get("user")
}

export function getSession(c: Context) {
  return c.get("session")
}
`;

const AUTH_SCHEMA_SQLITE = `import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
  image: text("image"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
})

export const session = sqliteTable("session", {
  id: text("id").primaryKey(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
})

export const account = sqliteTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp" }),
  refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp" }),
  scope: text("scope"),
  password: text("password"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
})

export const verification = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }),
  updatedAt: integer("updated_at", { mode: "timestamp" }),
})
`;

const AUTH_SCHEMA_PG = `import { pgTable, text, timestamp, boolean, integer } from 'drizzle-orm/pg-core'

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull(),
})

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at", { mode: "date" }).notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
})

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { mode: "date" }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { mode: "date" }),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull(),
})

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
  createdAt: timestamp("created_at", { mode: "date" }),
  updatedAt: timestamp("updated_at", { mode: "date" }),
})
`;

function ensureDbIndexExports(projectRoot: string): void {
	const dbIndexPath = path.join(projectRoot, "src/db/index.ts");
	if (!existsSync(dbIndexPath)) {
		logger.warn(`Could not find db/index.ts at ${dbIndexPath}`);
		return;
	}

	const current = readFileSync(dbIndexPath, "utf-8");
	if (current.includes('export * from "./auth-schema"')) {
		return;
	}

	if (current.includes("export * from ")) {
		const updated = current.replace(
			'export * from "./schema"',
			'export * from "./schema"\nexport * from "./auth-schema"',
		);
		writeFileSync(dbIndexPath, updated);
		logger.info("Updated src/db/index.ts to export auth-schema");
	}
}

function ensureEnvVar(projectRoot: string): void {
	const envPath = path.join(projectRoot, ".env.example");
	if (!existsSync(envPath)) return;

	const env = readFileSync(envPath, "utf-8");
	if (env.includes("AUTH_SECRET=")) return;

	writeFileSync(
		envPath,
		`${env.trimEnd()}\n\n# Auth\nAUTH_SECRET=your-secret-key-here-change-in-production\nAUTH_URL=http://localhost:3000`,
	);
}

function updateIndexForAuth(projectRoot: string): void {
	const indexPath = path.join(projectRoot, "src/index.ts");
	if (!existsSync(indexPath)) {
		logger.warn(`Could not find src/index.ts at ${indexPath}`);
		return;
	}

	const current = readFileSync(indexPath, "utf-8");

	// Add import for auth if not present
	if (!current.includes('import { auth } from "./auth"')) {
		// Try with semicolon first, then without
		let insertAfter = 'import { registerRoutes } from "./routes";';
		const importLine = '\nimport { auth } from "./auth";';
		let updated = current.replace(insertAfter, insertAfter + importLine);

		if (updated === current) {
			insertAfter = 'import { registerRoutes } from "./routes"';
			updated = current.replace(insertAfter, insertAfter + importLine);
		}

		writeFileSync(indexPath, updated);
	}

	// Add the auth handler mount if not present
	const updatedWithMount = readFileSync(indexPath, "utf-8");
	if (!updatedWithMount.includes("/api/auth/**")) {
		// Try with semicolon first, then without
		let insertAfter = "registerRoutes(app);";
		const mountCode = `\n\napp.on(["POST", "GET"], "/api/auth/**", (c) => {\n  return auth.handler(c.req.raw)\n})`;
		let final = updatedWithMount.replace(insertAfter, insertAfter + mountCode);

		if (final === updatedWithMount) {
			insertAfter = "registerRoutes(app)";
			final = updatedWithMount.replace(insertAfter, insertAfter + mountCode);
		}

		writeFileSync(indexPath, final);
		logger.info("Updated src/index.ts with BetterAuth handler mount");
	}
}

export async function runAuthSetupCommand(
	projectRoot: string = process.cwd(),
	provider: "sqlite" | "pg" = "sqlite",
): Promise<void> {
	const resolvedRoot = path.resolve(projectRoot);
	const srcDir = path.join(resolvedRoot, "src");

	// Check if auth is already set up (idempotency check)
	const authIndexPath = path.join(srcDir, "auth", "index.ts");
	if (existsSync(authIndexPath)) {
		logger.info("✅ Auth is already set up!");
		return;
	}

	logger.info("🔐 Setting up BetterAuth...");

	// Check if auth is already set up by looking for auth-schema.ts
	let authSchemaPath = path.join(srcDir, "db", "auth-schema.ts");
	if (existsSync(authSchemaPath)) {
		logger.info("✅ Auth is already set up!");

		// Ask if they want to re-run migrations
		const shouldRunMigrations = await confirm({
			message: "Would you like to re-run migrations?",
			default: false,
		});

		if (shouldRunMigrations) {
			logger.info("🗄️ Running database migrations...");
			try {
				execSync("bunx drizzle-kit push", { cwd: resolvedRoot, stdio: "inherit" });
				logger.success("✅ Migrations complete!");
			} catch (error: any) {
				logger.warn(
					`Could not run drizzle-kit push automatically: ${error.message}. Please run it manually.`,
				);
			}
		}

		return;
	}

	// Install better-auth
	logger.info("📦 Installing better-auth...");
	try {
		execSync("bun add better-auth", { cwd: resolvedRoot, stdio: "inherit" });
	} catch (error: any) {
		logger.warn(
			`Could not install better-auth automatically: ${error.message}. Please run "bun add better-auth" manually.`,
		);
	}

	// Create src/auth directory
	const authDir = path.join(srcDir, "auth");
	mkdirSync(authDir, { recursive: true });

	// Create src/db/auth-schema.ts
	logger.info("📝 Creating auth schema...");
	authSchemaPath = path.join(srcDir, "db", "auth-schema.ts");
	const schemaContent = provider === "sqlite" ? AUTH_SCHEMA_SQLITE : AUTH_SCHEMA_PG;
	writeFileSync(authSchemaPath, schemaContent);

	// Ensure db/index.ts exports auth-schema
	ensureDbIndexExports(resolvedRoot);

	// Create src/auth/index.ts
	logger.info("🔑 Creating auth instance...");
	const authIndexFilePath = path.join(authDir, "index.ts");
	writeFileSync(authIndexFilePath, AUTH_INSTANCE_FILE(provider));

	// Create src/auth/types.ts
	logger.info("📋 Creating auth types...");
	const authTypesPath = path.join(authDir, "types.ts");
	writeFileSync(authTypesPath, AUTH_TYPES_FILE);

	// Create src/middleware/auth.ts
	logger.info("🛡️ Creating auth middleware...");
	const middlewarePath = path.join(srcDir, "middleware", "auth.ts");
	writeFileSync(middlewarePath, AUTH_MIDDLEWARE_FILE);

	// Update src/index.ts to mount auth handler
	updateIndexForAuth(resolvedRoot);

	// Ensure .env.example has AUTH_SECRET
	ensureEnvVar(resolvedRoot);

	// Run migrations
	logger.info("🗄️ Running database migrations...");
	try {
		// Use drizzle-kit push to push schema directly without needing migration files
		logger.info("Executing drizzle-kit push...");
		execSync("bunx drizzle-kit push", { cwd: resolvedRoot, stdio: "inherit" });
	} catch (error: any) {
		logger.warn(
			`Could not run drizzle-kit push automatically: ${error.message}. Please run it manually.`,
		);
	}

	logger.success("✅ BetterAuth setup complete!");
	logger.info("Next steps:");
	logger.info("1. Set AUTH_SECRET in .env (already added to .env.example)");
	logger.info("2. Run: bunx drizzle-kit push (if not already run)");
	logger.info("3. Use requireAuth middleware on protected routes:");
	logger.info("   import { requireAuth } from './middleware/auth'");
	logger.info("   app.use('*', requireAuth)");
}

export async function runAuthAddProviderCommand(
	projectRoot: string,
	providerName: string,
): Promise<void> {
	const resolvedRoot = path.resolve(projectRoot);
	const template = getProviderTemplate(providerName);

	if (!template) {
		logger.error(`Unknown provider: ${providerName}`);
		logger.info(`Available: ${getAvailableProviders().join(", ")}`);
		process.exit(1);
	}

	logger.info(`Adding ${template.displayName} OAuth provider...`);

	// Check if auth file exists
	const authFile = path.join(resolvedRoot, "src", "auth", "index.ts");
	if (!existsSync(authFile)) {
		logger.error(`Auth file not found at ${authFile}. Run 'bb auth setup' first.`);
		process.exit(1);
	}

	let authContent = readFileSync(authFile, "utf-8");

	// Check if provider already configured
	if (authContent.includes(`${template.name}:`)) {
		logger.warn(`${template.displayName} is already configured`);
		return;
	}

	// Find socialProviders section
	const socialRegex = /socialProviders:\s*\{([\s\S]*?)\n {2}\}/;
	const match = authContent.match(socialRegex);

	if (match) {
		// Add to existing socialProviders - find the closing brace of the last provider
		const existing = match[1];

		// Check if existing content ends with a closing brace (provider object)
		const trimmed = existing.trim();
		let newContent: string;

		if (trimmed.endsWith("}")) {
			// Add comma and new provider
			newContent = `${trimmed.slice(0, -1)},\n${template.configCode}\n  }`;
		} else {
			newContent = `${trimmed}\n${template.configCode}\n  }`;
		}

		authContent = authContent.replace(socialRegex, `socialProviders: {\n${newContent}`);
	} else {
		// Create socialProviders section
		authContent = authContent.replace(
			/betterAuth\(\s*{/,
			`betterAuth({\n  socialProviders: {\n${template.configCode}\n  },`,
		);
	}

	// Write updated file
	writeFileSync(authFile, authContent, "utf-8");
	logger.success(`✅ Added ${template.displayName} to ${authFile}`);

	// Add env vars to .env
	const envFile = path.join(resolvedRoot, ".env");
	let envContent = "";
	try {
		envContent = readFileSync(envFile, "utf-8");
	} catch {
		// File doesn't exist, will be created
	}

	const envVarsToAdd: string[] = [];
	for (const envVar of template.envVars) {
		if (!envContent.includes(envVar.key)) {
			envVarsToAdd.push(`${envVar.key}=""`);
		}
	}

	if (envVarsToAdd.length > 0) {
		const newEnv = envContent.trim()
			? `${envContent}\n\n# ${template.displayName} OAuth\n${envVarsToAdd.join("\n")}\n`
			: `# ${template.displayName} OAuth\n${envVarsToAdd.join("\n")}\n`;

		writeFileSync(envFile, newEnv, "utf-8");
		logger.success("\u2705 Added env vars to .env");
	}

	// Print setup instructions
	const authUrl = "http://localhost:3000"; // Default fallback
	const instructions = template.setupInstructions.replace(
		/\$\{process\.env\.AUTH_URL \|\| 'http:\/\/localhost:3000'\}/g,
		authUrl,
	);

	console.log(`\n${"=".repeat(60)}`);
	console.log(`${template.displayName} OAuth Setup Instructions:`);
	console.log(instructions);
	console.log("=".repeat(60));
	console.log(`\nDocs: ${template.docsUrl}\n`);
}
