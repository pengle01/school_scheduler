"""Independent check of a timetable against the data. Shares no code with model.py:
everything is recomputed from the placements alone, so a mis-encoded constraint in the
model shows up here as a violation."""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass

from .data import School, impossible_atoms, order_sets, order_violations


@dataclass
class Violation:
    code: str
    message: str
    hard: bool = True


def _runs(periods: list[int]) -> list[list[int]]:
    out: list[list[int]] = []
    for p in sorted(periods):
        if out and p == out[-1][-1] + 1:
            out[-1].append(p)
        else:
            out.append([p])
    return out


def verify(school: School, placements: list[dict]) -> list[Violation]:
    v: list[Violation] = []
    slots_of: dict[str, list[tuple[int, int]]] = defaultdict(list)
    for p in placements:
        slots_of[p["lesson"]].append((p["day"], p["period"]))
    valid = set(school.slots())

    # Every lesson placed with exactly its periods, inside the week, blocks consecutive and on distinct days
    for l in school.lessons.values():
        ss = slots_of.get(l.key, [])
        if len(ss) != l.periods:
            v.append(Violation("PERIODS", f"{l.label}: {len(ss)} placed, {l.periods} expected"))
            continue
        if len(set(ss)) != len(ss):
            v.append(Violation("PERIODS", f"{l.label}: duplicate slots"))
        for s in ss:
            if s not in valid:
                v.append(Violation("CALENDAR", f"{l.label}: slot {s} outside the week"))
        by_day: dict[int, list[int]] = defaultdict(list)
        for d, p in ss:
            by_day[d].append(p)
        chunks = sorted((len(r) for ps in by_day.values() for r in _runs(ps)), reverse=True)
        if any(len(_runs(ps)) > 1 for ps in by_day.values()) and school.rule("B2").mode == "HARD":
            v.append(Violation("B2", f"{l.label}: two blocks on the same day"))
        if not l.band and not l.fixed_slots and chunks != l.shape and school.rule("B1").mode == "HARD":
            v.append(Violation("B1", f"{l.label}: shape {'+'.join(map(str, chunks))} ≠ {'+'.join(map(str, l.shape))}"))
        if l.cross_day and not l.fixed_slots:
            have = set(ss)
            end, start = l.split
            across = lambda d: all((d, school.last_period(d) - i) in have for i in range(end)) and all((d + 1, 1 + i) in have for i in range(start))  # noqa: E731
            if not any(across(d) for d in school.days if d + 1 in school.days):
                v.append(Violation("CROSSDAY", f"{l.label}: no block across days (last {end} + first {start} of the next)"))
        locked = l.fixed_slots or (school.bands.get(l.band, {}).get("slots") if l.band else None)
        if locked and set(ss) != set(locked):
            v.append(Violation("LOCKS", f"{l.label}: not on its locked slots"))
        if l.teacher and l.teacher in school.teachers:
            bad = [s for s in ss if s in school.teachers[l.teacher].unavailable]
            if bad and school.rule("T1").mode == "HARD":
                v.append(Violation("T1", f"{l.label}: teacher unavailable at {bad}"))

    # Teacher clashes
    by_teacher_slot: dict[tuple[str, int, int], list[str]] = defaultdict(list)
    for l in school.lessons.values():
        if l.teacher:
            for s in slots_of.get(l.key, []):
                by_teacher_slot[(l.teacher, *s)].append(l.key)
    for (t, d, p), keys in by_teacher_slot.items():
        if len(keys) > 1:
            v.append(Violation("TEACHER", f"{t} at day {d} period {p}: {len(keys)} lessons ({', '.join(keys)})"))

    # Pupil clashes (per atom); hard or soft according to the rule
    s1_hard = school.rule("S1").mode == "HARD"
    impossible = impossible_atoms(school)  # only a provably impossible list is excused
    if school.rule("S1").mode != "OFF":
        for i, (keys, refs) in school.atoms.items():
            count: dict[tuple[int, int], list[str]] = defaultdict(list)
            for k in keys:
                for s in slots_of.get(k, []):
                    count[s].append(k)
            for s, ks in count.items():
                if len(ks) > 1:
                    v.append(Violation("S1", f"{len(refs)} pupils ({', '.join(refs[:2])}…) at day {s[0]} period {s[1]}: {' ∥ '.join(school.lessons[k].label for k in ks)}", hard=s1_hard and i not in impossible))

    # Bands: identical slots
    for band in school.bands:
        opts = school.band_lessons(band)
        if len(opts) > 1:
            sets = {frozenset(slots_of.get(o.key, [])) for o in opts}
            if len(sets) > 1:
                v.append(Violation("P1", f"band {band}: options at different slots"))

    # Support inside host
    for l in school.lessons.values():
        if l.during and l.during in school.lessons:
            host = set(slots_of.get(l.during, []))
            if not set(slots_of.get(l.key, [])) <= host:
                v.append(Violation("SUPPORT", f"{l.label}: not within its host ({school.lessons[l.during].label})"))

    # O1: period k of a lesson after period k of each lesson entered as earlier
    o1 = school.rule("O1")
    if o1.mode != "OFF":
        for jkey, pkeys in order_sets(school):
            joint = school.lessons[jkey]
            mode, _ = o1.for_teacher(joint.teacher)
            if mode == "OFF":
                continue
            for pkey in pkeys:
                n = order_violations(slots_of.get(jkey, []), slots_of.get(pkey, []))
                if n:
                    v.append(Violation("O1", f"{joint.label}: {n} periods before the matching period of {school.lessons[pkey].label}", hard=mode == "HARD"))

    # T3 / T4 per teacher
    t3, t4 = school.rule("T3"), school.rule("T4")
    occ: dict[str, dict[int, list[tuple[int, str]]]] = defaultdict(lambda: defaultdict(list))  # teacher → day → [(period, lesson)]
    for l in school.lessons.values():
        if l.teacher:
            for d, p in slots_of.get(l.key, []):
                occ[l.teacher][d].append((p, l.key))
    for t, days in occ.items():
        mode3, _ = t3.for_teacher(t)
        last = sum(1 for d, ps in days.items() if any(p == school.last_period(d) for p, _ in ps))
        if mode3 == "HARD" and last > int(t3.params.get("max", 4)):
            v.append(Violation("T3", f"{t}: {last} last periods"))
        mode4, _ = t4.for_teacher(t)
        for d, ps in days.items():
            limit = int(t4.params.get("day8" if school.last_period(d) >= 8 else "day7", 5))
            # a long lesson is left out only when its own periods on the day exceed the limit
            per_lesson: dict[str, int] = defaultdict(int)
            for _, k in ps:
                per_lesson[k] += 1
            exempt = {k for k, n in per_lesson.items() if school.lessons[k].long and t4.params.get("longExempt", True) and n > limit}
            counted = [p for p, k in ps if k not in exempt]
            if mode4 == "HARD" and len(counted) > limit:
                v.append(Violation("T4", f"{t}: {len(counted)} periods on day {d} (limit {limit})"))

    # Rooms (only when the placements carry them)
    room_of = {(p["lesson"], p["day"], p["period"]): p.get("room") for p in placements if p.get("room")}
    if room_of:
        by_room_slot: dict[tuple[str, int, int], list[str]] = defaultdict(list)
        for (k, d, p), r in room_of.items():
            by_room_slot[(r, d, p)].append(k)
        for (r, d, p), ks in by_room_slot.items():
            if len(ks) > 1:
                v.append(Violation("ROOM", f"room {r} at day {d} period {p}: {', '.join(school.lessons[k].label for k in ks if k in school.lessons)}"))
        for l in school.lessons.values():
            used = {room_of.get((l.key, *s)) for s in slots_of.get(l.key, [])} - {None}
            if not used:
                if l.key in slots_of and school.rooms:
                    v.append(Violation("ROOM", f"{l.label}: no room assigned"))
                continue
            if l.room_mode == "ONLY" and l.rooms and not used <= set(l.rooms):
                v.append(Violation("ROOM", f"{l.label}: room outside its allowed list ({', '.join(sorted(used - set(l.rooms)))})"))
            if l.room_mode != "ONLY" and l.room_kind and not l.rooms:
                wrong = [r for r in used if r in school.rooms and school.rooms[r].kind != l.room_kind]
                if wrong:
                    v.append(Violation("ROOM", f"{l.label}: room of another type ({', '.join(wrong)})"))
            pupils = school.pupil_count(l)
            small = [r for r in used if r in school.rooms and school.rooms[r].capacity and pupils > school.rooms[r].capacity]
            if small:
                v.append(Violation("CAPACITY", f"{l.label}: {pupils} pupils in {', '.join(small)}", hard=False))
            if len(used) > 1:
                v.append(Violation("SAMEROOM" if l.same_room else "R3", f"{l.label}: {len(used)} different rooms", hard=l.same_room))

    # T2: failing where the rule is hard for the teacher, otherwise a count
    t2 = school.rule("T2")
    t2max = int(t2.params.get("max", 2))
    for t, days in occ.items():
        mode2, _ = t2.for_teacher(t)
        for d, ps in days.items():
            periods = sorted(p for p, _ in ps)
            for r in _runs(periods):
                if len(r) > t2max:
                    v.append(Violation("T2", f"{t}: {len(r)} consecutive on day {d}", hard=mode2 == "HARD"))
            if periods and (periods[-1] - periods[0] + 1) > len(periods):
                v.append(Violation("G1", f"{t}: {periods[-1] - periods[0] + 1 - len(periods)} gap(s) on day {d}", hard=False))
    return v


def summary(violations: list[Violation]) -> dict[str, int]:
    out: dict[str, int] = defaultdict(int)
    for x in violations:
        out[x.code] += 1
    return dict(out)
