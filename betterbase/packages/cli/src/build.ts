/**
 * Builds the CLI into a standalone bundled executable and prefixes the output with a Bun shebang.
 *
 * If the build fails, this function throws an Error whose message includes the number of build logs.
 * On success, it writes the bundled file to ./dist/index.js and prepends "#!/usr/bin/env bun" so the file can be executed directly.
 *
 * @throws Error When the Bun build reports failure; the error message contains the count of build logs.
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
    throw new Error(`Build failed with ${result.logs.length} error(s).`);
  }

  const outputPath = './dist/index.js';
  const compiled = await Bun.file(outputPath).text();
  await Bun.write(outputPath, `#!/usr/bin/env bun\n${compiled}`);
}

await buildStandaloneCli();