import { db } from "@/server/db";

export interface Context {
  db: typeof db;
  req?: Request;
}

export async function createTRPCContext(opts?: { req?: Request }): Promise<Context> {
  return { db, req: opts?.req };
}
