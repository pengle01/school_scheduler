// One-off: ΑΣΤ and ΕΞΣΤ no longer have a host lesson. Each of their pupils becomes excused from
// the old host, and the host link is removed. Safe to re-run. Writes a backup export first.
//
//   node --import tsx scripts/migrate-excusals.mts

import "dotenv/config";
import { writeFileSync } from "node:fs";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
try {
  const lessons = await db.lesson.findMany({
    where: { supportKind: { in: ["AST", "EXST"] }, hostLessonId: { not: null } },
    select: { id: true, supportKind: true, hostLessonId: true, students: { select: { studentId: true } } },
  });
  const backup = "data/backup-before-excusals.json";
  writeFileSync(backup, JSON.stringify(lessons, null, 1));
  const rows = lessons.flatMap((l) => l.students.map((s) => ({ studentId: s.studentId, lessonId: l.hostLessonId! })));
  await db.$transaction([
    db.studentExcusal.createMany({ data: rows, skipDuplicates: true }),
    db.lesson.updateMany({ where: { id: { in: lessons.map((l) => l.id) } }, data: { hostLessonId: null } }),
  ]);
  const excusals = await db.studentExcusal.count();
  console.log(`${lessons.length} lessons no longer have a host, ${excusals} excusals in the database, old links saved in ${backup}`);
} finally {
  await db.$disconnect();
}
