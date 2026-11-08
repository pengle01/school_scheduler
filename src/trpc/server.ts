import "server-only";

import { cache } from "react";
import { createCallerFactory } from "@/server/trpc/init";
import { createTRPCContext } from "@/server/trpc/context";
import { appRouter } from "@/server/trpc/routers/_app";

const createCachedContext = cache(createTRPCContext);
const createCaller = createCallerFactory(appRouter);

// Server-side caller for server components: `await trpc.teachers.list()`.
export const trpc = createCaller(createCachedContext);
