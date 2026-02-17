import { Command } from 'commander';
import { runInitCommand } from './commands/init';
import { runMigrateCommand } from './commands/migrate';
import * as logger from './utils/logger';
import packageJson from '../package.json';

/**
 * Create and configure the BetterBase CLI program.
 *
 * @returns The configured Commander `Command` instance for the CLI.
 */
export function createProgram(): Command {
  const program = new Command();

  program
    .name('bb')
    .description('BetterBase CLI')
    .version(packageJson.version, '-v, --version', 'display the CLI version');

  program
    .command('init')
    .description('Initialize a BetterBase project')
    .argument('[project-name]', 'project name')
    .action(async (projectName?: string) => {
      await runInitCommand({ projectName });
    });

  program
    .command('migrate')
    .description('Run BetterBase database migrations')
    .option('--destructive', 'allow destructive migration flow')
    .action(async (options: { destructive?: boolean }) => {
      await runMigrateCommand({ destructive: options.destructive });
    });

  return program;
}

/**
 * Run the BetterBase CLI with the given command-line arguments.
 *
 * @param argv - Argument vector to parse; defaults to `process.argv`
 */
export async function runCli(argv: string[] = process.argv): Promise<void> {
  const program = createProgram();
  await program.parseAsync(argv);
}

if (import.meta.main) {
  try {
    await runCli();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown CLI error';
    logger.error(message);
    process.exitCode = 1;
  }
}