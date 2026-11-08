// Import an export JSON into the database from the command line (no UI needed).
//
//   npm run import:json -- data/orologio-26-27.json --replace   # wipe and load
//   npm run import:json -- data/orologio-26-27.json --merge     # upsert by name (default)
//   npm run import:json -- data/orologio-26-27.json --dry-run   # validate and count only
//
// Reads DATABASE_URL from .env (same as Prisma).

import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { countImport, danglingReferences } from "@/lib/exportFormat";
import { applyImport, parseExportFile } from "@/server/import";

const args = process.argv.slice(2);
const fileArg = args.find((a) => !a.startsWith("--"));
if (!fileArg) {
  console.error("usage: npm run import:json -- <file.json> [--replace|--merge] [--dry-run]");
  process.exit(2);
}
const mode = args.includes("--replace") ? "replace" : "merge";
const dryRun = args.includes("--dry-run");

const file = parseExportFile(readFileSync(resolve(process.cwd(), fileArg), "utf-8"));
console.table(countImport(file));
const problems = danglingReferences(file);
if (problems.length) {
  console.error(`${problems.length} dangling references:`);
  for (const p of problems.slice(0, 20)) console.error("  " + p);
  process.exit(1);
}
if (dryRun) {
  console.log("dry run: file is valid");
  process.exit(0);
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set (.env)");
  process.exit(1);
}

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const started = Date.now();
try {
  await applyImport(db, file, mode);
  console.log(`imported (${mode}) in ${((Date.now() - started) / 1000).toFixed(1)} s`);
} finally {
  await db.$disconnect();
}
