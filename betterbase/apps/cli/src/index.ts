#!/usr/bin/env node

/**
 * Entrypoint for the legacy "bb" CLI that delegates to the canonical CLI implementation.
 *
 * Dynamically imports the canonical CLI module and invokes it with the current process arguments.
 */
export async function runLegacyCli(): Promise<void> {
  const cliModule = await import('../../../packages/cli/src/index');
  await cliModule.runCli(process.argv);
}

if (import.meta.main) {
  await runLegacyCli();
}