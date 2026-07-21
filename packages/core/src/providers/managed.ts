import type {
	DatabaseConnection,
	DrizzleMigrationDriver,
	ProviderAdapter,
	ProviderConfig,
} from "./types";
import { ManagedProviderNotSupportedError } from "./errors";

/**
 * Placeholder adapter for the declared-but-unsupported `managed` provider.
 *
 * It implements the full {@link ProviderAdapter} interface so the type system
 * is satisfied and future implementation is a pure fill-in. Every method throws
 * {@link ManagedProviderNotSupportedError} — no fake/placeholder functionality.
 */
export class ManagedProviderAdapter implements ProviderAdapter {
	readonly type = "managed" as const;
	readonly dialect = "postgres" as const;

	async connect(_config: ProviderConfig): Promise<DatabaseConnection> {
		throw new ManagedProviderNotSupportedError();
	}

	getMigrationsDriver(): DrizzleMigrationDriver {
		throw new ManagedProviderNotSupportedError();
	}

	supportsRLS(): boolean {
		throw new ManagedProviderNotSupportedError();
	}

	supportsGraphQL(): boolean {
		throw new ManagedProviderNotSupportedError();
	}
}

/**
 * Create a new managed provider adapter instance.
 * @throws ManagedProviderNotSupportedError — managed provider is not yet supported.
 */
export function createManagedProvider(): ManagedProviderAdapter {
	throw new ManagedProviderNotSupportedError();
}
