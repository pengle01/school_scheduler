"""The CP-SAT model: placement variables per block, occupancy literals per unit and slot,
hard constraints, soft penalties and the objective."""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field

from ortools.sat.python import cp_model

from .data import School, order_sets
from .patterns import Unit, build_units, unit_of_lesson

# Hard groups that the infeasibility explanation can relax one at a time.
CLASH_WEIGHT = 1000  # per pupil, per clash, for pupils whose clash cannot be made hard

RELAXABLE = ["T3", "T4", "B2", "S1", "P1", "SUPPORT", "LOCKS", "T1", "O1", "ROOMS"]


@dataclass
class Model:
    cp: cp_model.CpModel
    units: list[Unit]
    unit_of: dict[str, Unit]
    # x[(unit, block index, placement index)]
    x: dict[tuple[str, int, int], cp_model.IntVar]
    # occ[(unit, day, period)]
    occ: dict[tuple[str, int, int], cp_model.IntVar]
    # teacher occupancy tocc[(teacher, day, period)]
    tocc: dict[tuple[str, int, int], cp_model.IntVar]
    penalties: dict[str, list[tuple[int, cp_model.IntVar]]] = field(default_factory=lambda: defaultdict(list))
    relaxed: set[str] = field(default_factory=set)
    # z[(lesson, room)]: the lesson's room for the week (joint rooms only)
    z: dict[tuple[str, str], cp_model.IntVar] = field(default_factory=dict)


def build(
    school: School,
    relax: set[str] | None = None,
    soft_atoms: set[int] | None = None,
    hints: dict[tuple[str, int, int], int] | None = None,
    ignore_atoms: set[int] | None = None,
    rooms: str = "off",
    room_hints: dict[tuple[str, str], int] | None = None,
) -> Model:
    """soft_atoms: atoms whose clash rule is soft even when S1 is hard (contradictory lists).
    hints: placement values from an earlier solution, to start the search from.
    rooms: "off" (rooms come after), "hard" (times must leave a room for every lesson),
    "costs" (also room preferences and R4 in the objective). See solver/joint.py."""
    relax = relax or set()
    soft_atoms = soft_atoms or set()
    cp = cp_model.CpModel()
    units = build_units(school, ignore_locks="LOCKS" in relax, ignore_unavailable="T1" in relax, split_bands="P1" in relax)
    unit_of = unit_of_lesson(units)
    slots = school.slots()
    m = Model(cp, units, unit_of, {}, {}, {})
    m.relaxed = relax

    def hard(code: str) -> bool:
        if code in relax:
            return False
        rule = school.rules.get(code)
        return rule is None or rule.mode == "HARD"

    # ── placements and occupancy ──
    for u in units:
        covering: dict[tuple[int, int], list[cp_model.IntVar]] = defaultdict(list)
        if not any(b.placements for b in u.blocks):
            raise ValueError(f"{u.label}: no possible placement (unavailability/locks)")
        b1 = school.rule("B1")
        total: list = []
        for b in u.blocks:
            if b.required and not b.placements:
                # No legal placement at all (e.g. teacher never free for a triple): make it visible.
                raise ValueError(f"{u.label}: block of {b.length} periods has no possible placement (unavailability/locks)")
            vars_ = []
            for i, pl in enumerate(b.placements):
                v = cp.NewBoolVar(f"x[{u.id}][{b.index}][{i}]")
                m.x[(u.id, b.index, i)] = v
                vars_.append(v)
                total.append(b.length * v)
                for s in pl.slots:
                    covering[s].append(v)
            if b.required is not None:
                cp.Add(sum(vars_) == b.required)
            elif u.flexible and b1.weight > 0 and b.length in u.shape:
                # B1: every declared block that is not realised costs its weight
                short = cp.NewIntVar(0, u.shape.count(b.length), f"b1[{u.id}][{b.length}]")
                cp.Add(short >= u.shape.count(b.length) - sum(vars_))
                m.penalties["B1"].append((b1.weight, short))
        if u.flexible:
            cp.Add(sum(total) == u.periods)  # the cross-day block (required) is part of the total
        for s in slots:
            o = cp.NewBoolVar(f"occ[{u.id}][{s[0]}][{s[1]}]")
            m.occ[(u.id, *s)] = o
            if covering.get(s):
                cp.Add(sum(covering[s]) == o)
            else:
                cp.Add(o == 0)
        # B2: blocks of one unit on different days
        if hard("B2") and u.periods > 1:
            for day in school.days:
                on_day = [m.x[(u.id, b.index, i)] for b in u.blocks for i, pl in enumerate(b.placements) if day in pl.days]
                if on_day:
                    cp.AddAtMostOne(on_day)

    # ── teacher occupancy and clash ──
    by_teacher: dict[str, list[Unit]] = defaultdict(list)
    for u in units:
        for t in u.teachers:  # multiplicity kept: a teacher in two options of a band clashes with themself
            by_teacher[t].append(u)
    for t, tus in by_teacher.items():
        for s in slots:
            o = cp.NewBoolVar(f"tocc[{t}][{s[0]}][{s[1]}]")
            m.tocc[(t, *s)] = o
            cp.Add(sum(m.occ[(u.id, *s)] for u in tus) == o)  # ≤ 1 by boolean

    # ── pupils (atoms) ──
    s1 = school.rule("S1")
    if s1.mode != "OFF":
        skip = ignore_atoms or set()
        s1_hard = hard("S1")
        for i, (keys, refs) in school.atoms.items():
            if i in skip:
                continue
            atom_units = {unit_of[k].id for k in keys if k in unit_of}
            if len(atom_units) < 2:
                continue
            for s in slots:
                if s1_hard and i not in soft_atoms:
                    cp.AddAtMostOne(m.occ[(uid, *s)] for uid in atom_units)
                else:
                    # soft: every extra lesson a pupil would have to be in at once costs weight × pupils
                    excess = cp.NewIntVar(0, len(atom_units), f"s1[{i}][{s[0]}][{s[1]}]")
                    cp.Add(excess >= sum(m.occ[(uid, *s)] for uid in atom_units) - 1)
                    # a clash outweighs every comfort rule when the rule is hard for the school
                    weight = CLASH_WEIGHT if s1_hard else s1.weight
                    m.penalties["S1"].append((weight * len(refs), excess))

    # ── support ⊂ host ──
    if hard("SUPPORT"):
        for l in school.lessons.values():
            if not l.during or l.during not in unit_of:
                continue
            su, hu = unit_of[l.key], unit_of[l.during]
            for s in slots:
                cp.Add(m.occ[(su.id, *s)] <= m.occ[(hu.id, *s)])

    # ── O1: a lesson comes after the lessons entered on it (e.g. joint Physics after each group's) ──
    # In week order, its period k comes after period k of every earlier lesson:
    # min(its periods up to t, earlier lesson's periods) ≤ earlier lesson's periods before t.
    o1 = school.rule("O1")
    if o1.mode != "OFF":
        for jkey, pkeys in order_sets(school):
            joint = school.lessons[jkey]
            mode, weight = o1.for_teacher(joint.teacher)
            if mode == "OFF" or jkey not in unit_of:
                continue
            hard_o1 = mode == "HARD" and "O1" not in relax
            ju = unit_of[jkey].id
            for pkey in pkeys:
                if pkey not in unit_of:
                    continue
                pu, pn = unit_of[pkey].id, school.lessons[pkey].periods
                k = min(pn, joint.periods)
                for i, s in enumerate(slots):
                    upto = cp.NewIntVar(0, joint.periods, f"o1j[{jkey}][{pkey}][{i}]")
                    cp.Add(upto == sum(m.occ[(ju, *x)] for x in slots[: i + 1]))
                    capped = cp.NewIntVar(0, k, f"o1c[{jkey}][{pkey}][{i}]")
                    cp.AddMinEquality(capped, [upto, k])
                    before = sum(m.occ[(pu, *x)] for x in slots[:i])
                    if hard_o1:
                        cp.Add(capped <= before)
                    else:
                        late = cp.NewIntVar(0, k, f"o1late[{jkey}][{pkey}][{i}]")
                        cp.Add(late >= capped - before)
                        m.penalties["O1"].append((max(1, weight), late))

    # ── T3: last periods per week ──
    t3 = school.rule("T3")
    for t in by_teacher:
        mode, weight = t3.for_teacher(t)
        if mode == "OFF" or (mode == "HARD" and "T3" in relax):
            continue
        last = [m.tocc[(t, d, school.last_period(d))] for d in school.days]
        limit = int(t3.params.get("max", 4))
        if mode == "HARD":
            cp.Add(sum(last) <= limit)
        else:
            over = cp.NewIntVar(0, len(last), f"t3over[{t}]")
            cp.Add(over >= sum(last) - limit)
            m.penalties["T3"].append((weight, over))

    # ── T4: daily maximum. A long lesson is left out only on a day when its own periods
    #    exceed the limit (a full-day workshop); shorter long lessons count like any other. ──
    t4 = school.rule("T4")
    long_exempt = bool(t4.params.get("longExempt", True))
    for t, tus in by_teacher.items():
        mode, weight = t4.for_teacher(t)
        if mode == "OFF" or (mode == "HARD" and "T4" in relax):
            continue
        for d in school.days:
            limit = int(t4.params.get("day8" if school.last_period(d) >= 8 else "day7", 5))
            terms: list = []
            for u in tus:
                on_day = [m.occ[(u.id, d, p)] for p in school.periods(d)]
                if not (long_exempt and u.long and u.periods > limit and len(on_day) > limit):
                    terms.extend(on_day)
                    continue
                # counted = the unit's periods on this day, or 0 when they exceed the limit
                exempt = cp.NewBoolVar(f"t4x[{t}][{u.id}][{d}]")
                counted = cp.NewIntVar(0, limit, f"t4n[{t}][{u.id}][{d}]")
                cp.Add(sum(on_day) >= (limit + 1) * exempt)
                cp.Add(counted >= sum(on_day) - len(on_day) * exempt)
                terms.append(counted)
            if not terms:
                continue
            if mode == "HARD":
                cp.Add(sum(terms) <= limit)
            else:
                over = cp.NewIntVar(0, len(terms), f"t4over[{t}][{d}]")
                cp.Add(over >= sum(terms) - limit)
                m.penalties["T4"].append((weight, over))

    # ── T2: consecutive periods (soft by default) ──
    t2 = school.rule("T2")
    for t in by_teacher:
        mode, weight = t2.for_teacher(t)
        if mode == "OFF":
            continue
        mx = int(t2.params.get("max", 2))
        for d in school.days:
            ps = school.periods(d)
            for start in range(0, len(ps) - mx):
                window = [m.tocc[(t, d, p)] for p in ps[start : start + mx + 1]]
                if mode == "HARD" and "T2" not in relax:
                    cp.Add(sum(window) <= mx)
                else:
                    pen = cp.NewBoolVar(f"t2[{t}][{d}][{start}]")
                    cp.Add(pen >= sum(window) - mx)
                    m.penalties["T2"].append((weight, pen))

    # ── G1: gaps between a teacher's lessons on a day (soft) ──
    g1 = school.rule("G1")
    for t in by_teacher:
        mode, weight = g1.for_teacher(t)
        if mode == "OFF":
            continue
        for d in school.days:
            ps = school.periods(d)
            occ = lambda p: m.tocc[(t, d, p)]  # noqa: E731
            for i in range(1, len(ps) - 1):
                gap = cp.NewBoolVar(f"gap1[{t}][{d}][{ps[i]}]")
                cp.Add(gap >= occ(ps[i - 1]) + occ(ps[i + 1]) - occ(ps[i]) - 1)
                m.penalties["G1"].append((weight, gap))
            for i in range(1, len(ps) - 2):
                gap = cp.NewBoolVar(f"gap2[{t}][{d}][{ps[i]}]")
                cp.Add(gap >= occ(ps[i - 1]) + occ(ps[i + 2]) - occ(ps[i]) - occ(ps[i + 1]) - 1)
                m.penalties["G1"].append((weight, gap))

    # ── T1 soft part: "prefer no lesson" slots ──
    t1 = school.rule("T1")
    for t in by_teacher:
        for s in school.teachers[t].prefer_free if t in school.teachers else ():
            if (t, *s) in m.tocc:
                m.penalties["T1soft"].append((max(1, t1.weight), m.tocc[(t, *s)]))

    if rooms != "off" and "ROOMS" not in relax:
        from .joint import add_rooms

        add_rooms(m, school, costs=rooms == "costs", hints=room_hints)

    if hints:
        for key, val in hints.items():
            if key in m.x:
                cp.AddHint(m.x[key], val)

    # ── objective ──
    terms = [w * v for group in m.penalties.values() for w, v in group]
    if terms:
        cp.Minimize(sum(terms))
    return m
