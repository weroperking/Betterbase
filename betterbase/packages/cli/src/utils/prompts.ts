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

const selectOptionsSchema = z
  .object({
    message: z.string().min(1),
    choices: z.array(selectOptionSchema).min(1),
    initial: z.string().optional(),
  })
  .refine(
    ({ choices, initial }) => initial === undefined || choices.some((choice) => choice.value === initial),
    {
      message: 'Select initial value must match one of the choice values.',
      path: ['initial'],
    },
  );

/**
 * Prompt for text input.
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
 * Prompt for yes/no confirmation.
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
 * Prompt for selecting one option.
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
