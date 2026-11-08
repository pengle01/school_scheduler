// Load the zone grid (each zone's fixed slots) from an export JSON into the database, by zone
// name, without touching anything else. Used to seed this year's grid from the Orologio conversion.
//
//   npm run zone-grid -- data/orologio-26-27.json

import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Prisma, PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { parseExportFile } from "@/server/import";

const [fileArg] = process.argv.slice(2);
if (!fileArg) {
  console.error("usage: npm run zone-grid -- <export.json>");
  process.exit(2);
}
const file = parseExportFile(readFileSync(resolve(process.cwd(), fileArg), "utf-8"));
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
try {
  let set = 0, missing = 0, empty = 0;
  for (const b of file.bands) {
    if (!b.fixedSlots?.length) {
      empty++;
      continue;
    }
    const r = await db.band.updateMany({ where: { name: b.name }, data: { fixedSlots: b.fixedSlots as Prisma.InputJsonValue } });
    if (r.count) set++;
    else missing++;
  }
  console.log(`zone grid: ${set} zones placed, ${empty} without slots in the file, ${missing} not found in the database`);
} finally {
  await db.$disconnect();
}
