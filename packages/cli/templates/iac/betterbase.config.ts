/**
 * BetterBase Configuration File - IaC Template
 *
 * This file defines the configuration for your BetterBase IaC project.
 * The IaC template uses betterbase/ functions with auto-migration.
 *
 * Supported database providers:
 * - 'postgres': Standard PostgreSQL (uses DATABASE_URL)
 * - 'neon': Neon serverless PostgreSQL (uses DATABASE_URL)
 * - 'supabase': Supabase PostgreSQL (uses DATABASE_URL)
 * - 'planetscale': PlanetScale MySQL (uses DATABASE_URL)
 * - 'turso': Turso libSQL (uses TURSO_URL and TURSO_AUTH_TOKEN)
 * - 'managed': BetterBase managed database (coming soon)
 *
 * Environment variables:
 * - DATABASE_URL: Connection string for postgres, neon, supabase, planetscale
 * - TURSO_URL: libSQL connection URL (for turso)
 * - TURSO_AUTH_TOKEN: Auth token for Turso database
 */

import { defineConfig } from "@betterbase/core";
import type { BetterBaseConfig } from "@betterbase/core";

/**
 * Database provider type
 * Update this to match your provider: postgres, neon, supabase, planetscale, turso, managed
 */
type ProviderType = "postgres" | "neon" | "supabase" | "planetscale" | "turso" | "managed";

/**
 * IaC Project Configuration
 *
 * The IaC template uses infrastructure-as-code with betterbase/ functions.
 * Define your schema in betterbase/schema.ts - migrations are auto-generated.
 *
 * @example
 * ```typescript
 * export default defineConfig({
 *   project: {
 *     name: 'my-iac-project',
 *   },
 *   provider: {
 *     type: 'neon',
 *     connectionString: process.env.DATABASE_URL,
 *   },
 * }) satisfies BetterBaseConfig
 * ```
 */
export default defineConfig({
	/** Project name - used for identification and metadata */
	project: {
		name: "my-iac-project",
	},

	/**
	 * Database provider configuration
	 *
	 * Change the type to match your provider:
	 * - 'postgres': Raw PostgreSQL
	 * - 'neon': Neon serverless Postgres
	 * - 'supabase': Supabase Postgres
	 * - 'planetscale': PlanetScale MySQL
	 * - 'turso': Turso edge database
	 * - 'managed': BetterBase managed (coming soon)
	 */
	provider: {
		/** The database provider type */
		type: "postgres" as ProviderType,

		/**
		 * Database connection string
		 * Format: postgresql://user:pass@host:port/db for PostgreSQL
		 * Format: mysql://user:pass@host:port/db for MySQL/PlanetScale
		 */
		connectionString: process.env.DATABASE_URL,

		// Turso-specific (uncomment if using Turso):
		// url: process.env.TURSO_URL,
		// authToken: process.env.TURSO_AUTH_TOKEN,
	},

	/**
	 * GraphQL API configuration
	 * Set enabled: false to disable the GraphQL API
	 */
	graphql: {
		enabled: true,
	},

	/**
	 * Auto-REST API configuration
	 * Automatically generates CRUD routes for all tables in the schema
	 */
	autoRest: {
		enabled: true,
	},
}) satisfies BetterBaseConfig;
