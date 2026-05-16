import { existsSync as fsExistsSync, readFileSync } from "node:fs";
import path from "node:path";
import { type BetterBaseConfig, parseConfig } from "@betterbase/core/config";
import { CONFIG_FILE_NAME } from "@betterbase/shared";
import * as logger from "./logger";

export async function findConfigFile(projectRoot: string): Promise<string | null> {
	const configPaths = [
		path.join(projectRoot, CONFIG_FILE_NAME),
		path.join(projectRoot, CONFIG_FILE_NAME.replace(".ts", ".js")),
		path.join(projectRoot, CONFIG_FILE_NAME.replace(".ts", ".mts")),
	];

	for (const configPath of configPaths) {
		if (fsExistsSync(configPath)) {
			return configPath;
		}
	}

	return null;
}

export async function loadConfig(projectRoot: string): Promise<BetterBaseConfig | null> {
	const configPath = await findConfigFile(projectRoot);

	if (!configPath) {
		return null;
	}

	try {
		const configModule = await import(configPath);
		const config = configModule.default || configModule;

		if (config && typeof config === "object") {
			const parseResult = parseConfig(config);
			if (parseResult.success) {
				return parseResult.data;
			}
			logger.warn(`Config validation: ${parseResult.error.message}`);
			return null;
		}

		return null;
	} catch (error) {
		logger.warn(`Failed to load config: ${error instanceof Error ? error.message : String(error)}`);
		return null;
	}
}

export async function readConfigFile(
	projectRoot: string,
): Promise<{ content: string; path: string } | null> {
	const configPath = await findConfigFile(projectRoot);
	if (!configPath) {
		return null;
	}

	try {
		const content = readFileSync(configPath, "utf-8");
		return { content, path: configPath };
	} catch {
		return null;
	}
}
