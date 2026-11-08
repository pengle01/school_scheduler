// The ministry's rule for ΣΤ: one period of Greek and one of Maths, both during French.
// ΑΣΤ and ΕΞΣΤ have no such rule; they take the place of the pupil's excused lessons.

export type StLesson = {
  subject: string;
  periods: number;
  host: { id: string; subject: string; periods: number; bandId: string | null } | null;
};

export type StIssue = "noGreek" | "noMaths" | "tooMany" | "otherSubject" | "notFrench" | "noRoomInFrench";

const isGreek = (subject: string) => subject.startsWith("Νέα Ελληνικά");
const isMaths = (subject: string) => subject.startsWith("Μαθηματικά");
const isFrench = (subject: string) => subject.startsWith("Γαλλικά");

/** What is wrong with one pupil's ΣΤ lessons. A pupil with no ΣΤ has nothing to check. */
export function stIssues(lessons: StLesson[]): StIssue[] {
  if (lessons.length === 0) return [];
  const issues: StIssue[] = [];
  const greek = lessons.filter((l) => isGreek(l.subject)).reduce((a, l) => a + l.periods, 0);
  const maths = lessons.filter((l) => isMaths(l.subject)).reduce((a, l) => a + l.periods, 0);
  if (greek === 0) issues.push("noGreek");
  if (maths === 0) issues.push("noMaths");
  if (greek > 1 || maths > 1) issues.push("tooMany");
  if (lessons.some((l) => !isGreek(l.subject) && !isMaths(l.subject))) issues.push("otherSubject");
  if (lessons.some((l) => !l.host || !isFrench(l.host.subject))) issues.push("notFrench");
  // Options of one band share their periods, so they count once.
  const capacity = new Map<string, number>();
  for (const l of lessons) if (l.host) capacity.set(l.host.bandId ?? l.host.id, l.host.periods);
  const room = [...capacity.values()].reduce((a, n) => a + n, 0);
  if (lessons.reduce((a, l) => a + l.periods, 0) > room) issues.push("noRoomInFrench");
  return issues;
}
