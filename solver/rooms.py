"""Room phase: with the times fixed, give every lesson block a room.

Hard: one lesson per room per period; "ONLY" lessons take one of their rooms; a lesson with
a room type takes a room of that type (unless it lists rooms); a room must hold the lesson's
pupils when both numbers are known.
Soft: preferred rooms in their order, the same room for all periods of a lesson, and few
room changes per teacher per day (rule R3), few different rooms per teacher in the week (R4).
A lesson flagged `sameRoom` makes the single room
hard: once a room is chosen from its list, every period of the lesson is held there."""

from __future__ import annotations

import time
from collections import defaultdict
from dataclasses import dataclass, field

from ortools.sat.python import cp_model

from .data import Lesson, School

RANK_WEIGHT = 2  # each step down the preference list
UNLISTED_WEIGHT = 20  # a room outside the preference list (PREFER mode)
CONSISTENCY_WEIGHT = 3  # a lesson spread over several rooms, per extra room
CAPACITY_WEIGHT = 1  # per pupil above a room's capacity, per period (capacities are soft)


@dataclass
class RoomResult:
    status: str
    rooms: dict[tuple[str, int, int], str] = field(default_factory=dict)  # (lesson, day, period) → room
    objective: float | None = None
    penalties: dict[str, int] = field(default_factory=dict)
    seconds: float = 0.0
    unplaceable: list[str] = field(default_factory=list)  # lessons with no candidate room


def _blocks(placements: list[dict]) -> dict[str, list[list[tuple[int, int]]]]:
    """Lesson → its blocks (runs of consecutive periods on one day) from the placements."""
    by_lesson: dict[str, list[tuple[int, int]]] = defaultdict(list)
    for p in placements:
        by_lesson[p["lesson"]].append((p["day"], p["period"]))
    out: dict[str, list[list[tuple[int, int]]]] = {}
    for key, slots in by_lesson.items():
        slots.sort()
        blocks: list[list[tuple[int, int]]] = []
        for d, p in slots:
            if blocks and blocks[-1][-1][0] == d and blocks[-1][-1][1] == p - 1:
                blocks[-1].append((d, p))
            else:
                blocks.append([(d, p)])
        out[key] = blocks
    return out


def candidates(school: School, lesson: Lesson) -> tuple[list[str], dict[str, int]]:
    """Rooms a lesson may use and the cost of each (0 = first preference). Capacity is
    not a filter — recorded capacities are unreliable — but a cost (see CAPACITY_WEIGHT)."""
    all_rooms = list(school.rooms)
    pupils = school.pupil_count(lesson)

    def over(name: str) -> int:
        cap = school.rooms[name].capacity
        return max(0, pupils - cap) if cap and pupils else 0

    listed = [r for r in lesson.rooms if r in school.rooms]
    cost: dict[str, int] = {}
    if lesson.room_mode == "ONLY" and listed:
        for i, r in enumerate(listed):
            cost[r] = i * RANK_WEIGHT + over(r) * CAPACITY_WEIGHT
        return listed, cost
    pool = [r for r in all_rooms if (not lesson.room_kind or school.rooms[r].kind == lesson.room_kind)] or all_rooms
    for i, r in enumerate(listed):
        cost[r] = i * RANK_WEIGHT + over(r) * CAPACITY_WEIGHT
    for r in pool:
        if r not in cost:
            cost[r] = (UNLISTED_WEIGHT if listed else 0) + over(r) * CAPACITY_WEIGHT
    return list(cost), cost


def assign_rooms(school: School, placements: list[dict], time_limit: float = 120, workers: int = 8, log=print, hint: dict[str, str] | None = None) -> RoomResult:
    """hint: lesson → room to start from (the joint model's choice)."""
    started = time.time()
    if not school.rooms:
        log("no rooms in the data — room phase skipped")
        return RoomResult(status="SKIPPED")
    cp = cp_model.CpModel()
    blocks = _blocks(placements)
    r3 = school.rule("R3")
    r4 = school.rule("R4")
    y: dict[tuple[str, int, str], cp_model.IntVar] = {}  # (lesson, block index, room)
    slot_room: dict[tuple[int, int, str], list[cp_model.IntVar]] = defaultdict(list)
    penalties: dict[str, list[tuple[int, cp_model.IntVar | cp_model.LinearExpr]]] = defaultdict(list)
    unplaceable: list[str] = []
    cand_of: dict[str, list[str]] = {}

    for key, bl in blocks.items():
        lesson = school.lessons.get(key)
        if not lesson:
            continue
        rooms, cost = candidates(school, lesson)
        if not rooms:
            unplaceable.append(lesson.label)
            continue
        cand_of[key] = rooms
        for b, slots in enumerate(bl):
            vars_ = []
            for r in rooms:
                v = cp.NewBoolVar(f"y[{key}][{b}][{r}]")
                y[(key, b, r)] = v
                if hint and key in hint:
                    cp.AddHint(v, 1 if hint[key] == r else 0)
                vars_.append(v)
                for s in slots:
                    slot_room[(*s, r)].append(v)
                if cost[r]:
                    penalties["preference"].append((cost[r] * len(slots), v))
            cp.AddExactlyOne(vars_)
        # same room across the lesson's blocks
        if len(bl) > 1:
            used = []
            for r in rooms:
                u = cp.NewBoolVar(f"used[{key}][{r}]")
                for b in range(len(bl)):
                    cp.AddImplication(y[(key, b, r)], u)
                used.append(u)
            if lesson.same_room:
                cp.Add(sum(used) == 1)
            else:
                extra = cp.NewIntVar(0, len(rooms), f"extra[{key}]")
                cp.Add(extra >= sum(used) - 1)
                penalties["consistency"].append((CONSISTENCY_WEIGHT, extra))

    # one lesson per room per period
    for vars_ in slot_room.values():
        if len(vars_) > 1:
            cp.AddAtMostOne(vars_)

    # teacher room changes between consecutive periods of a day (R3)
    if r3.mode != "OFF":
        at: dict[tuple[str, int, int], tuple[str, int]] = {}  # (teacher, day, period) → (lesson, block)
        for key, bl in blocks.items():
            lesson = school.lessons.get(key)
            if not lesson or not lesson.teacher or key not in cand_of:
                continue
            for b, slots in enumerate(bl):
                for s in slots:
                    at[(lesson.teacher, *s)] = (key, b)
        for (t, d, p), (k1, b1) in at.items():
            nxt = at.get((t, d, p + 1))
            if not nxt:
                continue
            k2, b2 = nxt
            if k1 == k2:
                continue
            mode, weight = r3.for_teacher(t)
            if mode == "OFF":
                continue
            change = cp.NewBoolVar(f"chg[{t}][{d}][{p}]")
            common = set(cand_of[k1]) & set(cand_of[k2])
            if not common:
                cp.Add(change == 1)
            else:
                # change ≥ 1 − Σ_r (both in r)  ⇔  same room in some r avoids the penalty
                same = []
                for r in common:
                    both = cp.NewBoolVar(f"same[{t}][{d}][{p}][{r}]")
                    cp.AddBoolAnd([y[(k1, b1, r)], y[(k2, b2, r)]]).OnlyEnforceIf(both)
                    cp.AddImplication(both, y[(k1, b1, r)])
                    cp.AddImplication(both, y[(k2, b2, r)])
                    same.append(both)
                cp.Add(change + sum(same) >= 1)
            penalties["changes"].append((max(1, weight), change))

    # few different rooms per teacher over the week (R4): each room beyond the first costs the weight
    if r4.mode != "OFF":
        uses: dict[tuple[str, str], list] = defaultdict(list)  # (teacher, room) → y literals
        for (key, b, r), v in y.items():
            lesson = school.lessons.get(key)
            if lesson and lesson.teacher:
                uses[(lesson.teacher, r)].append(v)
        by_teacher: dict[str, list] = defaultdict(list)
        for (t, r), vs in uses.items():
            used = cp.NewBoolVar(f"troom[{t}][{r}]")
            cp.Add(sum(vs) <= len(vs) * used)  # one constraint per teacher and room keeps the model small
            by_teacher[t].append(used)
        for t, used in by_teacher.items():
            mode, weight = r4.for_teacher(t)
            if mode == "OFF" or len(used) < 2:
                continue
            extra = cp.NewIntVar(0, len(used), f"troomExtra[{t}]")
            cp.Add(extra >= sum(used) - 1)
            penalties["teacherRooms"].append((max(1, weight), extra))

    terms = [w * v for group in penalties.values() for w, v in group]
    if terms:
        cp.Minimize(sum(terms))
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = time_limit
    solver.parameters.num_workers = workers
    status = solver.Solve(cp)
    name = solver.StatusName(status)
    res = RoomResult(status=name, seconds=time.time() - started, unplaceable=unplaceable)
    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        for (key, b, r), v in y.items():
            if solver.Value(v):
                for s in blocks[key][b]:
                    res.rooms[(key, *s)] = r
        res.objective = solver.ObjectiveValue()
        res.penalties = {g: sum(solver.Value(v) for _w, v in items) for g, items in penalties.items()}
        log(f"rooms {name}: objective {res.objective:.0f}, {res.penalties}, {res.seconds:.0f}s")
    else:
        log(f"rooms {name} after {res.seconds:.0f}s")
    return res


def apply_rooms(placements: list[dict], rooms: dict[tuple[str, int, int], str]) -> list[dict]:
    return [{**p, "room": rooms.get((p["lesson"], p["day"], p["period"]))} for p in placements]
