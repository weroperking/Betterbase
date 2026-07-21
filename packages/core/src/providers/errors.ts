/**
 * Error thrown when the 'managed' provider type is selected.
 * Placeholder for future implementation.
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
