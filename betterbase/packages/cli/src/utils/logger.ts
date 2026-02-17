import chalk from 'chalk';

/**
 * Print an informational message to stderr.
 */
export function info(message: string): void {
  console.error(chalk.blue(`ℹ ${message}`));
}

/**
 * Print a warning message to stderr.
 */
export function warn(message: string): void {
  console.warn(chalk.yellow(`⚠ ${message}`));
}

/**
 * Print an error message to stderr.
 */
export function error(message: string): void {
  console.error(chalk.red(`✖ ${message}`));
}

/**
 * Print a success message to stderr.
 */
export function success(message: string): void {
  console.error(chalk.green(`✔ ${message}`));
}
