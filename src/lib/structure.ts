// Model B structures: inference from Orologio-style data (v1: groups + pools) and the
// checks the UI and the dashboard run on v2 lessons. Pure functions, unit-tested.

import { studentRef, type ExportFile, type ExportV1File, type LessonV2 } from "./exportFormat";

export type SupportKindValue = "ST" | "EXST" | "AST";
export type BandKindValue = "ELECTIVE" | "LEVEL" | "PARALLEL";

export function supportKindOf(groupName: string): SupportKindValue | null {
  if (groupName.startsWith("ΕΞΣΤ_")) return "EXST";
  if (groupName.startsWith("ΣΤ_")) return "ST";
  if (groupName.startsWith("ΑΣΤ_")) return "AST";
  return null;
}

export function bandKindOf(poolName: string): BandKindValue {
  if (/ΕΠΙΛ/.test(poolName)) return "ELECTIVE";
  if (/ΑΓΓΛ|ΜΑΘ$/.test(poolName)) return "LEVEL";
  return "ELECTIVE";
}

export interface InferReport {
  homeGroups: number;
  plain: number;
  merges: number;
  frenchBlocks: number;
  supportLessons: number;
  bands: number;
  parallelBands: number;
  hostsWithPullouts: number;
  fixedWorkshops: number;
  notes: string[];
}

// ── v1 → v2 ──────────────────────────────────────────────────────────────────────

export function upgradeV1(v1: ExportV1File): { file: ExportFile; report: InferReport } {
  const groups = new Map(v1.groups.map((g) => [g.name, g]));
  const homeNames = new Set(v1.groups.filter((g) => g.kind === "HOME").map((g) => g.name));
  const members = new Map<string, Set<string>>();
  const homeOfStudent = new Map<string, string | null>();
  for (const s of v1.students) {
    const ref = studentRef(s);
    homeOfStudent.set(ref, s.homeGroup);
    for (const g of s.groups) {
      if (!members.has(g)) members.set(g, new Set());
      members.get(g)!.add(ref);
    }
  }
  const report: InferReport = { homeGroups: homeNames.size, plain: 0, merges: 0, frenchBlocks: 0, supportLessons: 0, bands: 0, parallelBands: 0, hostsWithPullouts: 0, fixedWorkshops: 0, notes: [] };

  // Home groups a composite group stands for: declared parents, else the pupils' home groups.
  const homeGroupsOf = (groupName: string): string[] => {
    if (homeNames.has(groupName)) return [groupName];
    const g = groups.get(groupName);
    const parents = (g?.parents ?? []).filter((p) => homeNames.has(p));
    if (parents.length) return parents;
    const fromPupils = new Set<string>();
    for (const ref of members.get(groupName) ?? []) {
      const h = homeOfStudent.get(ref);
      if (h) fromPupils.add(h);
    }
    return [...fromPupils].sort();
  };

  type V1Lesson = ExportV1File["lessons"][number];
  const out: LessonV2[] = [];
  const bands = new Map<string, BandKindValue>();
  let seq = 0;
  const nextKey = () => `L${String(++seq).padStart(4, "0")}`;

  const base = (l: V1Lesson, homeGroups: string[]): LessonV2 => ({
    key: nextKey(),
    subject: l.subject,
    level: l.level,
    homeGroups,
    teacher: l.teacher,
    periods: l.periods,
    shape: l.shape,
    audience: "ALL",
    students: null,
    during: null,
    supportKind: null,
    band: null,
    long: l.long,
    fixedRoom: l.fixedRoom,
    roomMode: l.roomMode ?? "ANY",
    roomKind: l.roomKind ?? null,
    sameRoom: l.sameRoom ?? false,
    rooms: l.rooms ?? [],
    fixedSlots: l.fixedSlots ?? null,
    note: l.note,
  });
  const subset = (lesson: LessonV2, groupName: string): LessonV2 => ({
    ...lesson,
    audience: "SUBSET",
    students: [...(members.get(groupName) ?? [])].sort(),
    note: lesson.note ?? groupName,
  });
  const emit = (l: V1Lesson, homeGroups: string[]): LessonV2 | null => {
    if (!homeGroups.length) {
      report.notes.push(`skipped: ${l.group} ${l.subject} — no home group`);
      return null;
    }
    const v2 = base(l, homeGroups);
    out.push(v2);
    return v2;
  };

  const poolSlots = new Map(v1.pools.filter((p) => p.fixedSlots?.length).map((p) => [p.name, p.fixedSlots!]));

  // 1. Lessons without a pool: plain, merge, or a stray subset/support group.
  const byPool = new Map<string, V1Lesson[]>();
  for (const l of v1.lessons) {
    if (!l.pool) {
      const hg = homeGroupsOf(l.group);
      const v2 = emit(l, hg);
      if (!v2) continue;
      if (homeNames.has(l.group)) report.plain++;
      else {
        const kind = supportKindOf(l.group);
        if (kind) {
          Object.assign(subsetInto(v2, l.group), {});
          report.notes.push(`support without host: ${l.group} ${l.subject}`);
        } else if (hg.length > 1 && (groups.get(l.group)?.kind === "MERGED" || !members.has(l.group))) report.merges++;
        else Object.assign(v2, subset(v2, l.group));
      }
      continue;
    }
    if (!byPool.has(l.pool)) byPool.set(l.pool, []);
    byPool.get(l.pool)!.push(l);
  }
  function subsetInto(v2: LessonV2, groupName: string) {
    Object.assign(v2, subset(v2, groupName));
    return v2;
  }
  const pupilsOfHome = (names: string[]) => new Set([...homeOfStudent.entries()].filter(([, home]) => home && names.includes(home)).map(([ref]) => ref));
  // A subset lesson that names every pupil of its home groups is really a whole-group lesson.
  function coversAll(v2: LessonV2): boolean {
    if (v2.audience !== "SUBSET" || !v2.students?.length) return false;
    const all = pupilsOfHome(v2.homeGroups);
    if (!all.size || all.size !== v2.students.length) return false;
    v2.audience = "ALL";
    v2.students = null;
    return true;
  }
  const excusedFrom = new Map<string, Set<string>>(); // pupil → lesson keys (ΑΣΤ taught beside the class lesson)

  // 2. French blocks: pools ΓΑΛ_<base>_<n>
  const french = new Map<string, V1Lesson[][]>();
  for (const [pool, ls] of byPool) {
    const m = /^ΓΑΛ_(.+)_(\d)$/.exec(pool);
    if (!m) continue;
    if (!french.has(m[1])) french.set(m[1], []);
    french.get(m[1])![Number(m[2])] = ls;
    byPool.delete(pool);
  }
  for (const [baseName, periods] of french) {
    const all = periods.flat().filter(Boolean);
    const fr = all.filter((l) => l.group.startsWith("ΓΑΛ_"));
    const others = all.filter((l) => !l.group.startsWith("ΓΑΛ_"));
    if (!fr.length) {
      report.notes.push(`French block ${baseName} has no French lesson`);
      for (const l of others) {
        const v2 = emit(l, homeGroupsOf(l.group));
        if (v2) subsetInto(v2, l.group);
      }
      continue;
    }
    // One French lesson per teacher (normally one teacher for both periods)
    const byTeacher = new Map<string | null, V1Lesson[]>();
    for (const l of fr) byTeacher.set(l.teacher, [...(byTeacher.get(l.teacher) ?? []), l]);
    let host: LessonV2 | null = null;
    for (const [, ls] of byTeacher) {
      const first = ls[0];
      const hg = homeGroupsOf(first.group);
      const v2 = emit({ ...first, periods: ls.reduce((a, l) => a + l.periods, 0), shape: "" }, hg);
      if (!v2) continue;
      v2.shape = Array.from({ length: v2.periods }, () => 1).join("+");
      const pupils = new Set<string>();
      for (const l of ls) for (const ref of members.get(l.group) ?? []) pupils.add(ref);
      v2.audience = "SUBSET";
      v2.students = [...pupils].sort();
      v2.note = `ΓΑΛ_${baseName}`;
      host ??= v2;
    }
    report.frenchBlocks++;
    for (const l of others) {
      const v2 = emit(l, host!.homeGroups);
      if (!v2) continue;
      subsetInto(v2, l.group);
      if (coversAll(v2)) {
        // A "support" group with every pupil of the home groups is the groups' own lesson.
        report.notes.push(`${l.group} ${l.subject}: all pupils listed — kept as a plain lesson`);
        continue;
      }
      v2.during = host!.key;
      v2.supportKind = supportKindOf(l.group) ?? "ST";
      report.supportLessons++;
    }
  }

  // 3. Multi-period hosts split over pools base_1, base_2 … (same host subject/teacher) → re-join
  const splitHosts = new Map<string, string[]>();
  for (const pool of byPool.keys()) {
    const m = /^(.+)_(\d)$/.exec(pool);
    if (!m) continue;
    const ls = byPool.get(pool)!;
    const hostsHere = ls.filter((l) => !supportKindOf(l.group) && groups.get(l.group)?.kind !== "ELECTIVE");
    if (hostsHere.length === 1 && hostsHere[0].group.startsWith(m[1])) splitHosts.set(m[1], [...(splitHosts.get(m[1]) ?? []), pool]);
  }
  for (const [baseName, pools] of splitHosts) {
    if (pools.length < 2) continue;
    const all = pools.flatMap((p) => byPool.get(p)!);
    const hosts = all.filter((l) => !supportKindOf(l.group));
    const sameLesson = new Set(hosts.map((l) => `${l.subject}|${l.level}|${l.teacher}`)).size === 1;
    if (!sameLesson) continue;
    for (const p of pools) byPool.delete(p);
    const first = hosts[0];
    const v2 = emit({ ...first, periods: hosts.reduce((a, l) => a + l.periods, 0), shape: "" }, homeGroupsOf(first.group));
    if (!v2) continue;
    v2.shape = Array.from({ length: v2.periods }, () => 1).join("+");
    v2.note = baseName;
    report.hostsWithPullouts++;
    for (const l of all.filter((l) => supportKindOf(l.group))) {
      const s = emit(l, v2.homeGroups);
      if (!s) continue;
      subsetInto(s, l.group);
      s.during = v2.key;
      s.supportKind = supportKindOf(l.group)!;
      report.supportLessons++;
    }
  }

  // 4. Remaining pools: bands (elective / level / parallel sections) or host + pull-outs
  for (const [pool, ls] of byPool) {
    const supports = ls.filter((l) => supportKindOf(l.group));
    const others = ls.filter((l) => !supportKindOf(l.group));
    const hasElective = others.some((l) => groups.get(l.group)?.kind === "ELECTIVE");
    // One lesson with support lessons beside it is a host + pull-outs, whatever its group is called.
    const isHost = others.length === 1 && supports.length > 0;
    // One subject taught to the class and, at the same time, to a single pupil by another teacher:
    // that is individual support (ΑΣΤ) with the pupil excused from the class lesson, not a zone.
    const oneSubject = new Set(others.map((l) => `${l.subject}|${l.level}`)).size === 1;
    const singles = others.filter((l) => (members.get(l.group)?.size ?? 0) === 1);
    if (!isHost && !hasElective && supports.length === 0 && oneSubject && others.length >= 2 && singles.length >= 1 && singles.length < others.length) {
      const classLessons: LessonV2[] = [];
      for (const l of others.filter((l) => !singles.includes(l))) {
        const v2 = emit(l, homeGroupsOf(l.group));
        if (!v2) continue;
        if (!homeNames.has(l.group)) subsetInto(v2, l.group);
        coversAll(v2);
        classLessons.push(v2);
      }
      for (const l of singles) {
        const v2 = emit(l, classLessons[0]?.homeGroups ?? homeGroupsOf(l.group));
        if (!v2) continue;
        subsetInto(v2, l.group);
        v2.supportKind = "AST";
        const pupil = v2.students?.[0];
        if (pupil) for (const c of classLessons) excusedFrom.set(pupil, (excusedFrom.get(pupil) ?? new Set()).add(c.key));
        report.supportLessons++;
        report.notes.push(`${pool}: ${l.group} ${l.subject} is one pupil beside the class lesson — ΑΣΤ with an excusal, not a zone`);
      }
      continue;
    }
    if (!isHost && (hasElective || (others.length >= 2 && supports.length === 0))) {
      const kind: BandKindValue = hasElective ? bandKindOf(pool) : "PARALLEL";
      bands.set(pool, kind);
      if (kind === "PARALLEL") report.parallelBands++;
      else report.bands++;
      let firstOption: LessonV2 | null = null;
      for (const l of others) {
        const v2 = emit(l, homeGroupsOf(l.group));
        if (!v2) continue;
        if (!homeNames.has(l.group)) subsetInto(v2, l.group);
        v2.band = pool;
        firstOption ??= v2;
      }
      // Support lessons inside a band run during the band: attached to its first option.
      for (const l of supports) {
        const v2 = emit(l, firstOption?.homeGroups ?? homeGroupsOf(l.group));
        if (!v2) continue;
        subsetInto(v2, l.group);
        if (firstOption) {
          v2.during = firstOption.key;
          v2.supportKind = supportKindOf(l.group)!;
          report.supportLessons++;
        } else report.notes.push(`support without host: ${l.group} ${l.subject}`);
      }
      continue;
    }
    if (others.length === 1) {
      const h = others[0];
      const hg = homeGroupsOf(h.group);
      const host = emit(h, hg);
      if (!host) continue;
      // A host like ΘΡΗ_ΗΥ1 (13 of 14 pupils) is the home group's own lesson: audience ALL;
      // a host that is a genuine subset keeps its pupils.
      const hostPupils = members.get(h.group) ?? new Set();
      const supportPupils = new Set(supports.flatMap((s) => [...(members.get(s.group) ?? [])]));
      const allPupils = new Set([...homeOfStudent.entries()].filter(([, home]) => home && hg.includes(home)).map(([ref]) => ref));
      const covered = new Set([...hostPupils, ...supportPupils]);
      const isWhole = homeNames.has(h.group) || [...allPupils].every((p) => covered.has(p));
      if (!isWhole) subsetInto(host, h.group);
      else if (!homeNames.has(h.group)) host.note = h.group;
      report.hostsWithPullouts++;
      for (const s of supports) {
        const v2 = emit(s, hg);
        if (!v2) continue;
        subsetInto(v2, s.group);
        v2.during = host.key;
        v2.supportKind = supportKindOf(s.group)!;
        report.supportLessons++;
      }
      continue;
    }
    report.notes.push(`unclassified pool ${pool}: ${ls.map((l) => l.group).join(", ")}`);
    for (const l of ls) {
      const v2 = emit(l, homeGroupsOf(l.group));
      if (v2 && !homeNames.has(l.group)) subsetInto(v2, l.group);
    }
  }

  report.fixedWorkshops = out.filter((l) => l.fixedSlots && l.fixedSlots.length).length;

  const file: ExportFile = {
    format: "school-scheduler",
    version: 2,
    exportedAt: v1.exportedAt,
    settings: v1.settings,
    teachers: v1.teachers,
    subjects: v1.subjects,
    homeGroups: v1.groups.filter((g) => g.kind === "HOME").map((g) => ({ name: g.name, year: g.year, direction: g.direction, note: g.note })),
    students: v1.students.map((s) => ({ name: s.name, externalId: s.externalId, homeGroup: s.homeGroup, gender: s.gender, excusedFrom: [...(excusedFrom.get(studentRef(s)) ?? [])].sort() })),
    bands: [...bands.entries()].sort().map(([name, kind]) => ({ name, kind, note: null, fixedSlots: poolSlots.get(name) ?? null })),
    rooms: v1.rooms ?? [],
    lessons: out,
    rules: v1.rules,
  };
  return { file, report };
}

// ── checks on v2 data ─────────────────────────────────────────────────────────────

export interface LessonLike {
  key: string;
  homeGroups: string[];
  audience: "ALL" | "SUBSET";
  students: string[] | null;
  during: string | null;
  periods: number;
  band: string | null;
}

// Pupils of the host's home groups who have no lesson while the host runs.
// A pupil outside the host needs support lessons covering every period of the host.
// `siblings` are the other options of the host's band (their pupils are busy too).
export function coverageDuring(host: LessonLike, supports: LessonLike[], pupilsOfHomeGroup: Map<string, Set<string>>, siblings: LessonLike[] = [], excused: Set<string> = new Set()): string[] {
  const all = new Set<string>();
  for (const g of host.homeGroups) for (const p of pupilsOfHomeGroup.get(g) ?? []) all.add(p);
  const inHost = new Set<string>(host.audience === "ALL" ? all : host.students ?? []);
  for (const s of siblings) for (const p of s.audience === "ALL" ? s.homeGroups.flatMap((g) => [...(pupilsOfHomeGroup.get(g) ?? [])]) : s.students ?? []) inHost.add(p);
  const periods = new Map<string, number>();
  for (const s of supports) for (const p of s.students ?? []) periods.set(p, (periods.get(p) ?? 0) + s.periods);
  return [...all].filter((p) => !inHost.has(p) && !excused.has(p) && (periods.get(p) ?? 0) < host.periods).sort();
}

export interface BandCheck {
  periodMismatch: boolean;
  inTwoOptions: string[];
  inNoOption: string[];
}

export function bandCheck(options: LessonLike[], pupilsOfHomeGroup: Map<string, Set<string>>): BandCheck {
  const periods = new Set(options.map((o) => o.periods));
  const count = new Map<string, number>();
  const all = new Set<string>();
  for (const o of options) {
    for (const g of o.homeGroups) for (const p of pupilsOfHomeGroup.get(g) ?? []) all.add(p);
    const pupils = o.audience === "ALL" ? [...o.homeGroups.flatMap((g) => [...(pupilsOfHomeGroup.get(g) ?? [])])] : o.students ?? [];
    for (const p of pupils) count.set(p, (count.get(p) ?? 0) + 1);
  }
  return {
    periodMismatch: periods.size > 1,
    inTwoOptions: [...count.entries()].filter(([, n]) => n > 1).map(([p]) => p).sort(),
    inNoOption: [...all].filter((p) => !count.has(p)).sort(),
  };
}

// Pupils named in a SUBSET lesson who are not in its home groups.
export function pupilsOutsideHomeGroups(lesson: LessonLike, pupilsOfHomeGroup: Map<string, Set<string>>): string[] {
  if (lesson.audience !== "SUBSET" || !lesson.students) return [];
  const all = new Set<string>();
  for (const g of lesson.homeGroups) for (const p of pupilsOfHomeGroup.get(g) ?? []) all.add(p);
  return lesson.students.filter((p) => !all.has(p)).sort();
}
