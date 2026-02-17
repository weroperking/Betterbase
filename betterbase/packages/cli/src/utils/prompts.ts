import inquirer from 'inquirer';
import { z } from 'zod';

const textOptionsSchema = z.object({
  message: z.string().min(1),
  initial: z.string().optional(),
});

const confirmOptionsSchema = z.object({
  message: z.string().min(1),
  initial: z.boolean().optional(),
});

const selectOptionSchema = z.object({
  name: z.string().min(1),
  value: z.string().min(1),
});

const selectOptionsSchema = z.object({
  message: z.string().min(1),
  choices: z.array(selectOptionSchema).min(1),
  initial: z.string().optional(),
});

/**
 * Prompts the user to enter text using the provided message.
 *
 * @param options.message - The prompt message shown to the user
 * @param options.initial - Optional default value prefilled in the input
 * @returns The text entered by the user
 */
export async function text(options: { message: string; initial?: string }): Promise<string> {
  const parsed = textOptionsSchema.parse(options);

  const response = await inquirer.prompt<{ value: string }>([
    {
      type: 'input',
      name: 'value',
      message: parsed.message,
      default: parsed.initial,
    },
  ]);

  return response.value;
}

/**
 * Prompt the user with a yes/no confirmation.
 *
 * @param options.message - The message to display to the user
 * @param options.initial - The default selection if the user just presses Enter
 * @returns `true` if the user confirms, `false` otherwise.
 */
export async function confirm(options: { message: string; initial?: boolean }): Promise<boolean> {
  const parsed = confirmOptionsSchema.parse(options);

  const response = await inquirer.prompt<{ value: boolean }>([
    {
      type: 'confirm',
      name: 'value',
      message: parsed.message,
      default: parsed.initial,
    },
  ]);

  return response.value;
}

/**
 * Prompt the user to choose one option from a list.
 *
 * @param options - Configuration for the prompt:
 *   - `message`: The text displayed to the user.
 *   - `choices`: Array of choices where each item has a `name` (label shown) and `value` (returned value).
 *   - `initial`: Optional `value` to select by default.
 * @returns The `value` of the selected choice
 */
export async function select(
  options: { message: string; choices: Array<{ name: string; value: string }>; initial?: string },
): Promise<string> {
  const parsed = selectOptionsSchema.parse(options);

  const response = await inquirer.prompt<{ value: string }>([
    {
      type: 'list',
      name: 'value',
      message: parsed.message,
      choices: parsed.choices,
      default: parsed.initial,
    },
  ]);

  return response.value;
}