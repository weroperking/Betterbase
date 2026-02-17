/**
 * Build the CLI as a standalone bundled executable output.
 */
export async function buildStandaloneCli(): Promise<void> {
  const result = await Bun.build({
    entrypoints: ['./src/index.ts'],
    outdir: './dist',
    target: 'bun',
    format: 'esm',
    minify: false,
    sourcemap: 'external',
    naming: 'index.js',
  });

  if (!result.success) {
    const diagnostics = result.logs.map((log) => (typeof log === 'string' ? log : JSON.stringify(log))).join('\n');
    throw new Error(`Build failed with ${result.logs.length} error(s).\n${diagnostics}`);
  }

  const outputPath = './dist/index.js';
  const compiled = await Bun.file(outputPath).text();
  await Bun.write(outputPath, `#!/usr/bin/env bun\n${compiled}`);
}

async function main(): Promise<void> {
  await buildStandaloneCli();
}

const isEsmMain = typeof import.meta !== 'undefined' && import.meta.main;
const cjs = globalThis as unknown as { require?: { main?: unknown }; module?: unknown };
const isCjsMain = cjs.require?.main !== undefined && cjs.require.main === cjs.module;

if (isEsmMain || isCjsMain) {
  main().catch((error) => {
    console.error('Build failed:', error);
    process.exit(1);
  });
}
