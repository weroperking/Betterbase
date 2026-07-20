// Provider types and interfaces
export {
	type ProviderAdapter,
	type ProviderConfig,
	type DatabaseConnection,
	type DrizzleMigrationDriver,
	type DatabaseDialect,
	type NeonDatabaseConnection,
	type TursoDatabaseConnection,
	type PlanetScaleDatabaseConnection,
	type SupabaseDatabaseConnection,
	type PostgresDatabaseConnection,
	type NeonMigrationDriver,
	type TursoMigrationDriver,
	type PlanetScaleMigrationDriver,
	type SupabaseMigrationDriver,
	type PostgresMigrationDriver,
	ProviderConfigSchema,
	NeonProviderConfigSchema,
	TursoProviderConfigSchema,
	PlanetScaleProviderConfigSchema,
	SupabaseProviderConfigSchema,
	PostgresProviderConfigSchema,
	ManagedProviderConfigSchema,
	isValidProviderConfig,
	parseProviderConfig,
	safeParseProviderConfig,
} from "./types";

// Provider adapters
export { NeonProviderAdapter, createNeonProvider } from "./neon";
export { TursoProviderAdapter, createTursoProvider } from "./turso";
export {
	PlanetScaleProviderAdapter,
	createPlanetScaleProvider,
} from "./planetscale";
export { SupabaseProviderAdapter, createSupabaseProvider } from "./supabase";
export { PostgresProviderAdapter, createPostgresProvider } from "./postgres";
export {
	ManagedProviderAdapter,
	createManagedProvider,
} from "./managed";
export {
	GuardrailEngine,
	GuardrailViolationError,
	createGuardrailEngine,
	TenantModeSchema,
	TenantModeProviderSchema,
	type TenantMode,
	type TenantModeProvider,
	type EnforceOptions,
} from "./guardrail";
export {
	SetTenantModeRequestSchema,
	toTenantModeStatus,
	type SetTenantModeRequest,
	type TenantModeStatus,
} from "./tenant-mode";

import type { ProviderType } from "@betterbase/shared";
import { NeonProviderAdapter } from "./neon";
import { PlanetScaleProviderAdapter } from "./planetscale";
import { PostgresProviderAdapter } from "./postgres";
import { SupabaseProviderAdapter } from "./supabase";
import { TursoProviderAdapter } from "./turso";
import type { ProviderAdapter, ProviderConfig } from "./types";
import { parseProviderConfig } from "./types";

/**
 * Error thrown when the 'managed' provider type is selected
 * This is a placeholder for future implementation
 */
export class ManagedProviderNotSupportedError extends Error {
	constructor() {
		super(
			'The "managed" provider type is not yet supported. ' +
				"This feature is coming soon. Please use one of the supported providers: " +
				"neon, turso, planetscale, supabase, or postgres.",
		);
		this.name = "ManagedProviderNotSupportedError";
	}
}

/**
 * Resolve the appropriate provider adapter based on the configuration
 *
 * @param config - The provider configuration from BetterBase config
 * @returns The appropriate ProviderAdapter instance
 * @throws ManagedProviderNotSupportedError if provider type is 'managed'
 * @throws Error if provider type is unknown
 *
 * @example
 * ```typescript
 * import { resolveProvider } from '@betterbase/core/providers'
 *
 * const adapter = resolveProvider({
 *   type: 'neon',
 *   connectionString: process.env.DATABASE_URL
 * })
 *
 * const connection = await adapter.connect(config)
 * console.log(adapter.supportsRLS()) // true
 * ```
 */
export function resolveProvider(config: ProviderConfig): ProviderAdapter {
	// First validate the config
	const validatedConfig = parseProviderConfig(config);

	const providerType = validatedConfig.type;

	switch (providerType) {
		case "neon":
			return new NeonProviderAdapter();

		case "turso":
			return new TursoProviderAdapter();

		case "planetscale":
			return new PlanetScaleProviderAdapter();

		case "supabase":
			return new SupabaseProviderAdapter();

		case "postgres":
			return new PostgresProviderAdapter();

		case "managed":
			throw new ManagedProviderNotSupportedError();

		default: {
			// This should never happen due to Zod validation
			// but TypeScript needs exhaustive checking
			const _exhaustive: never = providerType;
			throw new Error(`Unknown provider type: ${_exhaustive}`);
		}
	}
}

/**
 * Resolve provider by provider type string (without full config validation)
 * Useful when you just need to create the adapter before connecting
 *
 * @param providerType - The type of provider to create
 * @returns The appropriate ProviderAdapter instance
 * @throws ManagedProviderNotSupportedError if provider type is 'managed'
 *
 * @example
 * ```typescript
 * import { resolveProviderByType } from '@betterbase/core/providers'
 *
 * const adapter = resolveProviderByType('neon')
 * await adapter.connect({ type: 'neon', connectionString: '...' })
 * ```
 */
export function resolveProviderByType(providerType: ProviderType): ProviderAdapter {
	switch (providerType) {
		case "neon":
			return new NeonProviderAdapter();

		case "turso":
			return new TursoProviderAdapter();

		case "planetscale":
			return new PlanetScaleProviderAdapter();

		case "supabase":
			return new SupabaseProviderAdapter();

		case "postgres":
			return new PostgresProviderAdapter();

		case "managed":
			throw new ManagedProviderNotSupportedError();

		default: {
			// This should never happen due to type checking
			const _exhaustive: never = providerType;
			throw new Error(`Unknown provider type: ${_exhaustive}`);
		}
	}
}

/**
 * Get a list of all supported provider types
 *
 * @returns Array of supported provider type strings
 *
 * @example
 * ```typescript
 * import { getSupportedProviders } from '@betterbase/core/providers'
 *
 * console.log(getSupportedProviders())
 * // ['neon', 'turso', 'planetscale', 'supabase', 'postgres']
 * ```
 */
export function getSupportedProviders(): Exclude<ProviderType, "managed">[] {
	return ["neon", "turso", "planetscale", "supabase", "postgres"];
}

/**
 * Check if a provider type supports Row Level Security
 *
 * @param providerType - The type of provider to check
 * @returns true if the provider supports RLS
 *
 * @example
 * ```typescript
 * import { providerSupportsRLS } from '@betterbase/core/providers'
 *
 * console.log(providerSupportsRLS('neon'))    // true
 * console.log(providerSupportsRLS('turso'))  // false
 * ```
 */
export function providerSupportsRLS(providerType: ProviderType): boolean {
	// RLS is not supported by Turso (SQLite) and PlanetScale (MySQL)
	const noRLSProviders: ProviderType[] = ["turso", "planetscale"];
	return !noRLSProviders.includes(providerType);
}

/**
 * Get the SQL dialect for a provider type
 *
 * @param providerType - The type of provider
 * @returns The SQL dialect string
 *
 * @example
 * ```typescript
 * import { getProviderDialect } from '@betterbase/core/providers'
 *
 * console.log(getProviderDialect('neon'))       // 'postgres'
 * console.log(getProviderDialect('turso'))       // 'sqlite'
 * console.log(getProviderDialect('planetscale')) // 'mysql'
 * ```
 */
export function getProviderDialect(providerType: ProviderType): "postgres" | "mysql" | "sqlite" {
	switch (providerType) {
		case "neon":
		case "supabase":
		case "postgres":
			return "postgres";
		case "planetscale":
			return "mysql";
		case "turso":
			return "sqlite";
		case "managed":
			throw new ManagedProviderNotSupportedError();
		default: {
			const _exhaustive: never = providerType;
			throw new Error(`Unknown provider type: ${_exhaustive}`);
		}
	}
}
