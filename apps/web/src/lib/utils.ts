import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Standard message from API error (axios-style). Use for mutation error surfacing.
 * Handles both NestJS ValidationPipe (message: string[]) and single-string messages. */
export function getMutationErrorMessage(
  err: unknown,
  fallback = 'Something went wrong.',
): string {
  const raw = (err as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
  const msg = Array.isArray(raw) ? raw[0] : raw;
  return typeof msg === 'string' ? msg : fallback;
}
