export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export interface BetterBaseResult<T> {
  data: T;
  error: null;
}

export interface BetterBaseError {
  data: null;
  error: { message: string; code: string };
}

export type BetterBaseResponse<T> = BetterBaseResult<T> | BetterBaseError;

export function noop(): void {
  // Shared placeholder utility for future cross-package helpers.
}
