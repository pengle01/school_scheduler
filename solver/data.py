"""Load the app's export JSON (v2) into plain dataclasses, derive the calendar, the rules
in force and who attends which lesson (atoms)."""

from __future__ import annotations

import json
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path

DEFAULT_DAYS_PERIODS = [8, 7, 7, 8, 7]

# Mirror of src/lib/rulesCatalog.ts — used when the file carries no rules.
DEFAULT_RULES: dict[str, dict] = {
    "L1": {"mode": "HARD", "weight": 1, "params": {}},
    "L4": {"mode": "HARD", "weight": 1, "params": {"pairs": [[1, 2], [2, 3], [3, 4], [4, 5]]}},
    "B1": {"mode": "SOFT", "weight": 5, "params": {}},
    "B2": {"mode": "HARD", "weight": 1, "params": {}},
    "P1": {"mode": "HARD", "weight": 1, "params": {}},
    "S1": {"mode": "HARD", "weight": 1, "params": {}},
    "T1": {"mode": "HARD", "weight": 1, "params": {}},
    "T2": {"mode": "SOFT", "weight": 3, "params": {"max": 2}},
    "T3": {"mode": "HARD", "weight": 1, "params": {"max": 4}},
    "T4": {"mode": "HARD", "weight": 1, "params": {"day7": 5, "day8": 6, "longExempt": True}},
    "G1": {"mode": "SOFT", "weight": 1, "params": {}},
    "R1": {"mode": "HARD", "weight": 1, "params": {}},
    "R2": {"mode": "HARD", "weight": 1, "params": {}},
    "R3": {"mode": "SOFT", "weight": 1, "params": {}},
    "R4": {"mode": "SOFT", "weight": 2, "params": {}},
    "O1": {"mode": "HARD", "weight": 10, "params": {}},
}


@dataclass
class Rule:
    code: str
    mode: str  # HARD | SOFT | OFF
    weight: int
    params: dict
    overrides: dict[str, tuple[str, int]] = field(default_factory=dict)  # teacher name → (mode, weight)

    def for_teacher(self, teacher: str | None) -> tuple[str, int]:
        if teacher and teacher in self.overrides:
            return self.overrides[teacher]
        return self.mode, self.weight


@dataclass
class Teacher:
    name: str
    obligation: int
    reduction: int
    active: bool
    unavailable: set[tuple[int, int]]  # (day, period) hard
    prefer_free: set[tuple[int, int]]  # (day, period) soft


@dataclass
class Room:
    name: str
    kind: str | None
    capacity: int | None


@dataclass
class Lesson:
    key: str
    subject: str
    level: str
    home_groups: list[str]
    teacher: str | None
    periods: int
    shape: list[int]  # chunks, largest first
    audience: str  # ALL | SUBSET
    students: list[str]  # pupil refs when SUBSET
    during: str | None  # host lesson key
    support_kind: str | None
    band: str | None
    long: bool
    fixed_slots: list[tuple[int, int]]  # (day, period) locks, empty = free
    note: str | None
    room_mode: str = "ANY"  # ANY | PREFER | ONLY
    room_kind: str | None = None
    rooms: list[str] = field(default_factory=list)  # preferred / allowed room names, in order
    same_room: bool = False  # every period in one room (hard)
    cross_day: bool = False  # one block across days: the last split[0] periods of a day + the first split[1] of the next
    split: tuple[int, int] = (1, 1)
    after: list[str] = field(default_factory=list)  # rule O1: keys of the lessons this one comes after

    @property
    def label(self) -> str:
        return f"{'+'.join(self.home_groups)} — {self.subject}" + (f" ({self.teacher})" if self.teacher else " (κενή)")


@dataclass
class School:
    name: str
    days_periods: list[int]
    teachers: dict[str, Teacher]
    home_groups: dict[str, dict]
    students: dict[str, dict]  # ref → record
    pupils_of_group: dict[str, set[str]]
    bands: dict[str, dict]
    rooms: dict[str, Room]
    lessons: dict[str, Lesson]
    rules: dict[str, Rule]
    # ref → set of lesson keys the pupil attends
    attendance: dict[str, set[str]] = field(default_factory=dict)
    # atom id → (lesson keys, pupil refs)
    atoms: dict[int, tuple[frozenset[str], list[str]]] = field(default_factory=dict)
    # lesson key → pupils who leave it for a support lesson
    pulled_from: dict[str, set[str]] = field(default_factory=dict)
    # adjustments made while building the model, reported to the user
    notes: list[str] = field(default_factory=list)
    # atoms whose clash rule was made soft (contradictory lists), set by the solver
    soft_atoms: set[int] = field(default_factory=set)
    excused: dict[str, list[str]] = field(default_factory=dict)  # pupil → lesson keys they do not attend

    # ── calendar ──
    @property
    def days(self) -> list[int]:
        return list(range(1, len(self.days_periods) + 1))

    def periods(self, day: int) -> list[int]:
        return list(range(1, self.days_periods[day - 1] + 1))

    def slots(self) -> list[tuple[int, int]]:
        return [(d, p) for d in self.days for p in self.periods(d)]

    def last_period(self, day: int) -> int:
        return self.days_periods[day - 1]

    def rule(self, code: str) -> Rule:
        return self.rules[code]

    def supports_of(self, host_key: str) -> list[Lesson]:
        return [l for l in self.lessons.values() if l.during == host_key]

    def band_lessons(self, band: str) -> list[Lesson]:
        return [l for l in self.lessons.values() if l.band == band]

    def pupil_count(self, lesson: Lesson) -> int:
        if lesson.audience == "SUBSET":
            return len(lesson.students)
        return sum(len(self.pupils_of_group.get(g, ())) for g in lesson.home_groups)


def parse_shape(text: str, periods: int, keep_order: bool = False) -> list[int]:
    parts = [int(x) for x in text.replace(" ", "").split("+") if x]
    if not parts or sum(parts) != periods or any(p < 1 for p in parts):
        return [1] * periods
    return parts if keep_order else sorted(parts, reverse=True)


def cross_split(shape: list[int], periods: int) -> tuple[int, int]:
    """A cross-day lesson's split: periods at the end of a day, then at the start of the next.
    The written shape gives it ("3+4"); without two chunks, a block of 2 is split 1 + 1."""
    if len(shape) >= 2:
        return shape[0], shape[1]
    n = max(2, min(periods, shape[0] if shape else 2))
    return (n + 1) // 2, n // 2


def fit_shape(shape: list[int], days: int) -> list[int]:
    """Blocks go on different days, so a shape cannot have more blocks than days:
    merge the two smallest chunks until it fits (7 singles → 2+2+1+1+1)."""
    chunks = sorted(shape, reverse=True)
    while len(chunks) > days:
        a, b = chunks.pop(), chunks.pop()
        chunks.append(a + b)
        chunks.sort(reverse=True)
    return chunks


def student_ref(s: dict) -> str:
    return s.get("externalId") or s["name"]


def normalize_support(raw: dict) -> dict:
    """ΣΤ runs during French; ΑΣΤ and ΕΞΣΤ have no host, their pupils are excused from lessons.
    Older files gave those two a host: it becomes an excusal of each of their pupils."""
    excused: dict[str, set[str]] = defaultdict(set)
    for l in raw["lessons"]:
        if l.get("during") and l.get("supportKind") in ("AST", "EXST"):
            for ref in l.get("students") or []:
                excused[ref].add(l["during"])
            l["during"] = None
    for s in raw["students"]:
        s["excusedFrom"] = sorted(set(s.get("excusedFrom") or []) | excused.get(student_ref(s), set()))
    return raw


def load(path: str | Path) -> School:
    raw = normalize_support(json.loads(Path(path).read_text(encoding="utf-8")))
    if raw.get("format") != "school-scheduler" or raw.get("version") != 2:
        raise ValueError("expected a school-scheduler export, version 2 (export from the app or run orologio:json)")
    settings = raw.get("settings", {})
    days_periods = settings.get("daysPeriods") or DEFAULT_DAYS_PERIODS
    if not (isinstance(days_periods, list) and all(isinstance(x, int) and x > 0 for x in days_periods)):
        days_periods = DEFAULT_DAYS_PERIODS

    teachers = {}
    for t in raw["teachers"]:
        teachers[t["name"]] = Teacher(
            name=t["name"],
            obligation=t.get("obligation", 0),
            reduction=t.get("reduction", 0),
            active=t.get("active", True),
            unavailable={(u["day"], u["period"]) for u in t.get("unavailability", []) if u.get("kind", "HARD") == "HARD"},
            prefer_free={(u["day"], u["period"]) for u in t.get("unavailability", []) if u.get("kind") == "SOFT"},
        )

    students = {student_ref(s): s for s in raw["students"]}
    excused = {ref: s["excusedFrom"] for ref, s in students.items() if s.get("excusedFrom")}
    pupils_of_group: dict[str, set[str]] = defaultdict(set)
    for ref, s in students.items():
        if s.get("homeGroup"):
            pupils_of_group[s["homeGroup"]].add(ref)

    lessons: dict[str, Lesson] = {}
    for l in raw["lessons"]:
        fixed = []
        for fs in l.get("fixedSlots") or []:
            for p in fs["periods"]:
                fixed.append((fs["day"], p))
        lessons[l["key"]] = Lesson(
            key=l["key"],
            subject=l["subject"],
            level=l.get("level", "NONE"),
            home_groups=list(l["homeGroups"]),
            teacher=l.get("teacher"),
            periods=l["periods"],
            shape=parse_shape(l.get("shape", ""), l["periods"], keep_order=True)
            if l.get("crossDay")
            else fit_shape(parse_shape(l.get("shape", ""), l["periods"]), len(days_periods)),
            audience=l.get("audience", "ALL"),
            students=list(l.get("students") or []),
            during=l.get("during"),
            support_kind=l.get("supportKind"),
            band=l.get("band"),
            long=bool(l.get("long")),
            fixed_slots=fixed,
            note=l.get("note"),
            room_mode=l.get("roomMode", "ANY"),
            room_kind=l.get("roomKind"),
            same_room=bool(l.get("sameRoom", False)),
            cross_day=bool(l.get("crossDay", False)),
            split=cross_split(parse_shape(l.get("shape", ""), l["periods"], keep_order=True), l["periods"]) if l.get("crossDay") else (1, 1),
            rooms=[r for r in (l.get("rooms") or []) if r] or ([l["fixedRoom"]] if l.get("fixedRoom") else []),
            after=list(l.get("after") or []),
        )

    rules: dict[str, Rule] = {}
    for code, d in DEFAULT_RULES.items():
        rules[code] = Rule(code, d["mode"], d["weight"], dict(d["params"]))
    for r in raw.get("rules", []):
        rule = rules.get(r["code"]) or Rule(r["code"], "OFF", 1, {})
        rule.mode = r.get("mode", rule.mode)
        rule.weight = r.get("weight", rule.weight)
        rule.params = {**rule.params, **(r.get("params") or {})}
        rule.overrides = {o["teacher"]: (o["mode"], o.get("weight", rule.weight)) for o in r.get("overrides", [])}
        rules[r["code"]] = rule

    school = School(
        name=str(settings.get("schoolName", "")),
        days_periods=days_periods,
        teachers=teachers,
        home_groups={g["name"]: g for g in raw["homeGroups"]},
        students=students,
        pupils_of_group=dict(pupils_of_group),
        bands={b["name"]: {**b, "slots": [(fs["day"], p) for fs in (b.get("fixedSlots") or []) for p in fs["periods"]]} for b in raw.get("bands", [])},
        excused=excused,
        rooms={r["name"]: Room(r["name"], r.get("kind"), r.get("capacity")) for r in raw.get("rooms", [])},
        lessons=lessons,
        rules=rules,
    )
    compute_attendance(school)
    return school


def compute_attendance(school: School) -> None:
    """A pupil attends every ALL lesson of their home group and every SUBSET lesson naming
    them, except a host lesson (or any option of the host's band) they leave for ΣΤ and any
    lesson they are excused from (with the other options when it is in a band)."""
    attendance: dict[str, set[str]] = defaultdict(set)
    pulled_from: dict[str, set[str]] = defaultdict(set)  # lesson key → pupils who leave it for support
    for l in school.lessons.values():
        if not l.during or l.during not in school.lessons:
            continue
        host = school.lessons[l.during]
        targets = [host.key] + ([o.key for o in school.band_lessons(host.band)] if host.band else [])
        for key in targets:
            pulled_from[key].update(l.students)
    for ref, keys in school.excused.items():
        for key in keys:
            if key not in school.lessons:
                continue
            excused = school.lessons[key]
            for target in [excused.key] + ([o.key for o in school.band_lessons(excused.band)] if excused.band else []):
                pulled_from[target].add(ref)
    school.pulled_from = dict(pulled_from)
    for l in school.lessons.values():
        pulled = pulled_from.get(l.key, set())
        refs = l.students if l.audience == "SUBSET" else [r for g in l.home_groups for r in school.pupils_of_group.get(g, ())]
        for ref in refs:
            if ref not in pulled:
                attendance[ref].add(l.key)
    school.attendance = dict(attendance)
    groups: dict[frozenset[str], list[str]] = defaultdict(list)
    for ref, keys in attendance.items():
        groups[frozenset(keys)].append(ref)
    school.atoms = {i: (keys, sorted(refs)) for i, (keys, refs) in enumerate(groups.items())}


def overbooked_atoms(school: School) -> dict[int, int]:
    """Atoms whose lessons sum to more periods than the week has: their membership lists
    overlap (a pupil listed in two lessons that cannot both be attended). The pupil-clash
    rule is skipped for them and they are reported."""
    total = len(school.slots())
    out = {}
    for i, (keys, _refs) in school.atoms.items():
        load = sum(school.lessons[k].periods for k in keys)
        if load > total:
            out[i] = load
    return out


def impossible_atoms(school: School) -> dict[int, str]:
    """Atoms whose lists cannot be clash-free in any timetable, whatever the solver does.
    Only provable cases: more periods than the week has, or more support periods than the
    host (or its band) has. Every other pupil must be clash-free."""
    total = len(school.slots())
    out: dict[int, str] = {}
    for i, (keys, _refs) in school.atoms.items():
        load = sum(school.lessons[k].periods for k in keys)
        if load > total:
            out[i] = f"listed for {load} periods, the week has {total}"
            continue
        during: dict[str, list[Lesson]] = defaultdict(list)
        for k in keys:
            l = school.lessons[k]
            if l.during and l.during in school.lessons:
                host = school.lessons[l.during]
                during[host.band or host.key].append(l)
        for supports in during.values():
            host = school.lessons[supports[0].during]
            n = sum(l.periods for l in supports)
            if n > host.periods:
                out[i] = f"{n} support periods during {host.label}, which has {host.periods}"
                break
    return out


def order_sets(school: School) -> list[tuple[str, list[str]]]:
    """Rule O1: (lesson key, keys of the lessons it comes after), as entered on each lesson."""
    return sorted((l.key, sorted(k for k in l.after if k in school.lessons and k != l.key)) for l in school.lessons.values() if l.after)


def order_violations(joint: list[tuple[int, int]], part: list[tuple[int, int]]) -> int:
    """Joint periods that do not come after the matching period of the part (k-th after k-th)."""
    j, p = sorted(joint), sorted(part)
    return sum(1 for k in range(min(len(j), len(p))) if not p[k] < j[k])


def data_problems(school: School) -> list[str]:
    """Things that make the model infeasible before any scheduling: reported, not solved."""
    problems = []
    total = len(school.slots())
    for name, t in school.teachers.items():
        load = sum(l.periods for l in school.lessons.values() if l.teacher == name)
        free = total - len(t.unavailable)
        if load > free:
            problems.append(f"teacher {name}: {load} periods but only {free} available slots")
    for l in school.lessons.values():
        if l.during and l.during not in school.lessons:
            problems.append(f"{l.label}: host {l.during} missing")
        for k in l.after:
            if k not in school.lessons or k == l.key:
                problems.append(f"{l.label}: comes after unknown lesson {k}")
        if l.during and l.periods > school.lessons[l.during].periods:
            problems.append(f"{l.label}: more periods than its host")
        if l.fixed_slots and len(l.fixed_slots) != l.periods:
            problems.append(f"{l.label}: {len(l.fixed_slots)} locked slots for {l.periods} periods")
    return problems
