#!/usr/bin/env bun

/**
 * Legacy bb wrapper entrypoint.
 *
 * Forwards execution to the canonical CLI implementation in packages/cli.
 */
export async function runLegacyCli(): Promise<void> {
  const { runCli } = await import('@betterbase/cli');
  await runCli(process.argv);
}

if (import.meta.main) {
  (async () => {
    await runLegacyCli();
  })().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  });
}
