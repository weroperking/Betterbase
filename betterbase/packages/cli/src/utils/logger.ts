import chalk from 'chalk';

/**
 * Print an informational message prefixed with an info icon and colored blue.
 *
 * The message is prefixed with "ℹ" and written to stdout.
 *
 * @param message - The text to print as an informational message
 */
export function info(message: string): void {
  console.log(chalk.blue(`ℹ ${message}`));
}

/**
 * Logs a warning message to stdout with a yellow "⚠" prefix.
 *
 * @param message - The warning text to display
 */
export function warn(message: string): void {
  console.log(chalk.yellow(`⚠ ${message}`));
}

/**
 * Print an error message to stderr prefixed with a red "✖" icon.
 *
 * @param message - The error message to print
 */
export function error(message: string): void {
  console.error(chalk.red(`✖ ${message}`));
}

/**
 * Print a success message to stdout prefixed with a check mark and colored green.
 *
 * @param message - The message text to display after the check mark
 */
export function success(message: string): void {
  console.log(chalk.green(`✔ ${message}`));
}