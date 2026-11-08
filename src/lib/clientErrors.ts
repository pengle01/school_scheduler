// Server errors carry a short message key (see src/server/trpc/errors.ts and the
// routers); the UI translates it under `errors.<key>` and falls back to a generic text.
export const ERROR_KEYS = ["inUse", "duplicate", "notFound", "badShape", "badJson", "badFormat", "dangling"] as const;
export type ErrorKey = (typeof ERROR_KEYS)[number];

export function errorKey(err: unknown): ErrorKey | "generic" {
  const message = (err as { message?: string } | null)?.message ?? "";
  return (ERROR_KEYS as readonly string[]).includes(message) ? (message as ErrorKey) : "generic";
}
