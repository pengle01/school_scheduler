// Attach a solver result (timetable JSON) to the database so the Πρόγραμμα page can show it.
//
//   npm run import:timetable -- data/timetable-26-27-noclash.json ["name"]
//
// Lessons are matched by content (subject, groups, teacher, periods, pupils, band). Files written
// before the solver embedded that information are matched through the data file named in `source`.

import "dotenv/config";
import { existsSync, readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { parseExportFile } from "@/server/import";
import { identitiesOfExport, importTimetable, parseTimetableFile } from "@/server/timetable";

const [fileArg, nameArg] = process.argv.slice(2);
if (!fileArg) {
  console.error('usage: npm run import:timetable -- <timetable.json> ["name"]');
  process.exit(2);
}
const file = parseTimetableFile(readFileSync(resolve(process.cwd(), fileArg), "utf-8"));
// The source data file is the most complete description of the lessons (it also knows which pupils
// are excused from which part); the file's own lesson list is the fallback when the source is gone.
let identities = file.lessons;
const src = file.source ? resolve(process.cwd(), file.source) : null;
if (src && existsSync(src)) {
  identities = identitiesOfExport(parseExportFile(readFileSync(src, "utf-8")));
  console.log(`lessons matched through ${file.source}`);
} else if (!identities) {
  console.error(`the timetable carries no lesson list and its source ${file.source} is not here`);
  process.exit(1);
}
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
try {
  const r = await importTimetable(db, nameArg ?? basename(fileArg, ".json"), file, identities);
  console.log(`timetable ${r.id}: ${r.placements} placements`);
  for (const c of r.teacherChanged) console.log(`teacher changed since the solve: ${c.subject} ${c.homeGroups.join("+")}: ${c.from ?? "—"} → ${c.to ?? "—"} (check the new teacher for clashes)`);
  const other = r.problems.length - r.teacherChanged.length;
  if (other) console.log(`${other} lessons with a different number of periods than placed (lessons edited since the solve?)`);
} catch (e) {
  // tsx may load the module twice, so compare the key rather than the class
  const key = e instanceof Error ? (e as Error & { key?: string }).key : undefined;
  if (key === "timetableMismatch") {
    console.error("some lessons of the file no longer exist in the database — re-export, re-solve, then import");
    process.exit(1);
  }
  if (key === "timetableNoLessons") {
    console.error("the timetable carries no lesson list and no source file — re-run the solver to get one");
    process.exit(1);
  }
  throw e;
} finally {
  await db.$disconnect();
}
