import { TRPCError } from "@trpc/server";

// Prisma's foreign-key error on delete → a CONFLICT the UI can translate
// ("still used by other records"). Anything else is rethrown.
export function rethrowAsConflict(err: unknown, messageKey = "inUse"): never {
  const code = (err as { code?: string } | null)?.code;
  if (code === "P2003") throw new TRPCError({ code: "CONFLICT", message: messageKey });
  if (code === "P2002") throw new TRPCError({ code: "CONFLICT", message: "duplicate" });
  if (code === "P2025") throw new TRPCError({ code: "NOT_FOUND", message: "notFound" });
  throw err;
}
