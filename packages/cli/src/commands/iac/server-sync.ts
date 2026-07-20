import { ProjectEnvironment } from "./env-detector";
import { createApiClient } from "../../utils/api-client";
import { isAuthenticated } from "../../utils/credentials";
import { SerializedSchema } from "@betterbase/core/iac";

export interface SyncWithServerOptions {
	schema: SerializedSchema;
	envConfig: ProjectEnvironment;
	environment: string;
	force?: boolean;
}

export async function syncWithServer(
	projectRoot: string,
	config: SyncWithServerOptions,
): Promise<{ success: boolean }> {
	// Check authentication
	if (!(await isAuthenticated())) {
		throw new Error("Not authenticated. Run: bb login --headless --api-key $BETTERBASE_API_KEY");
	}

	const apiClient = createApiClient();

	// 1. Register project if not exists
	const project = await apiClient.registerProject({
		name: config.envConfig.database.connectionString?.split("/").pop() ?? "unknown",
		environment: config.environment,
		config: config.envConfig,
	});

	// 2. Sync schema
	const syncResult = await apiClient.syncSchema({
		projectId: project.id,
		schema: config.schema,
		force: config.force,
	});

	// 3. Sync environment variables
	await apiClient.syncEnvironment({
		projectId: project.id,
		envConfig: config.envConfig,
	});

	return syncResult;
}
