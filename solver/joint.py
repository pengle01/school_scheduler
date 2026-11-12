"""Rooms inside the time model, so the times leave room for every lesson.

Every lesson chooses one room for its whole week among its first `EXPLICIT` candidate rooms,
or a "pool" (any of its other candidates). An explicit room holds one lesson per period. A
pool is checked by counting: at every period, the lessons that can only use rooms of a set
P never outnumber the rooms in P (P = all rooms, a room type, a long "only these" list).
Counting is exact for "any room" and room types; the room phase that follows picks the
actual pool rooms with the times fixed, and may still split a lesson over rooms if that is
cheaper there.

Costs (stage 2 only) are the room phase's: preference rank, rooms outside the list,
capacity, and R4 (few rooms per teacher)."""

from __future__ import annotations

from collections import defaultdict

from ortools.sat.python import cp_model

from .data import School
from .rooms import candidates

EXPLICIT = 6  # rooms modelled one by one per lesson; further candidates form its pool


def add_rooms(m, school: School, costs: bool, hints: dict[tuple[str, str], int] | None = None) -> None:
    """Adds room choice to model `m` (a model.Model). `costs`: add the preference terms."""
    cp: cp_model.CpModel = m.cp
    slots = school.slots()
    all_rooms = frozenset(school.rooms)
    if not all_rooms:
        return
    room_slot: dict[tuple[str, int, int], list] = defaultdict(list)  # explicit room, slot → literals
    # per lesson: its pool (or None) and per-slot "in pool" literals; explicit rooms per slot
    in_pool: list[tuple[frozenset, dict[tuple[int, int], object]]] = []
    explicit_at: list[tuple[str, dict[tuple[int, int], object]]] = []  # (room, slot → literal)
    total: dict[tuple[int, int], list] = defaultdict(list)
    r4 = school.rule("R4")
    teacher_room: dict[tuple[str, str], list] = defaultdict(list)
    hints = hints or {}

    for l in school.lessons.values():
        u = m.unit_of.get(l.key)
        if not u:
            continue
        rooms, cost = candidates(school, l)
        if not rooms:
            continue
        occ = {s: m.occ[(u.id, *s)] for s in slots}
        for s in slots:
            total[s].append(occ[s])
        listed = [r for r in l.rooms if r in cost]
        ordered = listed + [r for r in rooms if r not in listed]
        explicit = ordered if len(ordered) <= EXPLICIT else listed[:EXPLICIT]
        rest = frozenset(rooms) - set(explicit)
        if l.same_room and not explicit:
            explicit = ordered[:EXPLICIT]
            rest = frozenset(rooms) - set(explicit)
        choice = []
        for r in explicit:
            z = cp.NewBoolVar(f"z[{l.key}][{r}]")
            m.z[(l.key, r)] = z
            choice.append(z)
            if (l.key, r) in hints:
                cp.AddHint(z, hints[(l.key, r)])
            lit_at = {}
            for s in slots:
                w = cp.NewBoolVar(f"w[{l.key}][{r}][{s[0]}][{s[1]}]")
                cp.AddBoolOr([occ[s].Not(), z.Not(), w])  # w ≥ occ ∧ z; w only appears in "at most" limits
                room_slot[(r, *s)].append(w)
                lit_at[s] = w
            explicit_at.append((r, lit_at))
            if costs and cost[r]:
                m.penalties["rooms"].append((cost[r] * l.periods, z))
            if l.teacher:
                teacher_room[(l.teacher, r)].append(z)
        if rest and not l.same_room:
            pool = frozenset(rooms)  # pool lessons may use any of their candidates
            if choice:
                f = cp.NewBoolVar(f"zpool[{l.key}]")
                choice.append(f)
                if costs:
                    fcost = min(cost[r] for r in rest)
                    if fcost:
                        m.penalties["rooms"].append((fcost * l.periods, f))
                lit_at = {}
                if pool != all_rooms:
                    for s in slots:
                        w = cp.NewBoolVar(f"wp[{l.key}][{s[0]}][{s[1]}]")
                        cp.AddBoolOr([occ[s].Not(), f.Not(), w])
                        lit_at[s] = w
            else:
                lit_at = occ  # pool only: it is in the pool whenever it runs
            if pool != all_rooms:
                in_pool.append((pool, lit_at))
        if choice:
            cp.AddExactlyOne(choice)

    # one lesson per explicit room per period (R1)
    for lits in room_slot.values():
        if len(lits) > 1:
            cp.AddAtMostOne(lits)
    # every lesson needs some room
    for s, lits in total.items():
        if len(lits) > len(all_rooms):
            cp.Add(sum(lits) <= len(all_rooms))
    # pools: lessons confined to a set P never outnumber its rooms
    for pool in {p for p, _ in in_pool}:
        for s in slots:
            terms = [lit[s] for p, lit in in_pool if p <= pool]
            terms += [lit[s] for r, lit in explicit_at if r in pool]
            if len(terms) > len(pool):
                cp.Add(sum(terms) <= len(pool))

    # R4: few different rooms per teacher (explicit rooms only; pool rooms are chosen later)
    if costs and r4.mode != "OFF":
        by_teacher: dict[str, list] = defaultdict(list)
        for (t, r), zs in teacher_room.items():
            used = cp.NewBoolVar(f"jtroom[{t}][{r}]")
            cp.Add(sum(zs) <= len(zs) * used)
            by_teacher[t].append(used)
        for t, used in by_teacher.items():
            mode, weight = r4.for_teacher(t)
            if mode == "OFF" or len(used) < 2:
                continue
            extra = cp.NewIntVar(0, len(used), f"jtroomExtra[{t}]")
            cp.Add(extra >= sum(used) - 1)
            m.penalties["teacherRooms"].append((max(1, weight), extra))


def room_hints(m, solver: cp_model.CpSolver) -> dict[tuple[str, str], int]:
    return {k: int(solver.Value(v)) for k, v in m.z.items()}


def hints_from_rooms(school: School, placements: list[dict]) -> dict[tuple[str, str], int]:
    """A previous timetable's rooms → hints (each lesson's most used room)."""
    count: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    for p in placements:
        if p.get("room"):
            count[p["lesson"]][p["room"]] += 1
    out = {}
    for key, rooms in count.items():
        best = max(rooms, key=rooms.get)
        for r in school.rooms:
            out[(key, r)] = 1 if r == best else 0
    return out


def chosen_rooms(m, solver: cp_model.CpSolver) -> dict[str, str]:
    """Lesson → the explicit room the joint model chose (pool lessons are absent)."""
    return {key: r for (key, r), z in m.z.items() if solver.Value(z)}
