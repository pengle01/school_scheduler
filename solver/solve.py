"""Run the model, extract placements, explain infeasibility."""

from __future__ import annotations

import time
from collections import defaultdict
from dataclasses import dataclass, field

from ortools.sat.python import cp_model

from .data import School, impossible_atoms
from .model import RELAXABLE, Model, build


@dataclass
class Result:
    status: str  # OPTIMAL | FEASIBLE | INFEASIBLE | UNKNOWN
    placements: list[dict] = field(default_factory=list)  # {lesson, day, period}
    objective: float | None = None
    bound: float | None = None
    penalties: dict[str, int] = field(default_factory=dict)  # group → number of active penalties
    seconds: float = 0.0
    explanation: list[str] = field(default_factory=list)
    # lists that are provably impossible (clash allowed, reported as data errors)
    contradictory_atoms: dict[int, list[str]] = field(default_factory=dict)
    # possible lists the solver failed to make clash-free: the timetable is not acceptable
    unresolved_atoms: dict[int, list[str]] = field(default_factory=dict)
    # joint rooms: lesson → room chosen with the times (a start for the room phase)
    rooms: dict[str, str] = field(default_factory=dict)


class _Progress(cp_model.CpSolverSolutionCallback):
    def __init__(self, log):
        super().__init__()
        self.log = log
        self.count = 0

    def on_solution_callback(self):
        self.count += 1
        self.log(f"  solution {self.count}: objective {self.ObjectiveValue():.0f} (bound {self.BestObjectiveBound():.0f}) at {self.WallTime():.0f}s")


def _solver(time_limit: float, workers: int, seed: int) -> cp_model.CpSolver:
    s = cp_model.CpSolver()
    s.parameters.max_time_in_seconds = time_limit
    s.parameters.num_workers = workers
    s.parameters.random_seed = seed
    return s


def extract(m: Model, solver: cp_model.CpSolver) -> list[dict]:
    out = []
    for u in m.units:
        for b in u.blocks:
            for i, pl in enumerate(b.placements):
                if solver.Value(m.x[(u.id, b.index, i)]):
                    for day, period in pl.slots:
                        for lesson in u.lessons:
                            out.append({"lesson": lesson.key, "day": day, "period": period})
    out.sort(key=lambda p: (p["lesson"], p["day"], p["period"]))
    return out


def hints_from_placements(school: School, placements: list[dict]) -> dict[tuple[str, int, int], int]:
    """Turn a previous timetable into placement hints (unit, block, placement index → 1)."""
    from .patterns import build_units

    slots_of: dict[str, list[tuple[int, int]]] = {}
    for p in placements:
        slots_of.setdefault(p["lesson"], []).append((p["day"], p["period"]))
    hints: dict[tuple[str, int, int], int] = {}
    for u in build_units(school):
        slots = sorted(set(slots_of.get(u.lessons[0].key, [])))
        if not slots:
            continue
        placed: set[tuple[int, int, int]] = set()  # (day, start, length)
        run: list[int] = []
        for d, p in slots + [(None, None)]:
            if run and d == run[0] and p == run[1] + run[2]:
                run[2] += 1
                continue
            if run:
                placed.add(tuple(run))
            run = [d, p, 1]
        for b in u.blocks:
            for i, pl in enumerate(b.placements):
                hints[(u.id, b.index, i)] = 1 if all(r in placed for r in pl.runs()) else 0
    return hints


class _StopAtZero(_Progress):
    def on_solution_callback(self):
        super().on_solution_callback()
        if self.ObjectiveValue() == 0:
            self.StopSearch()


def _clashing_atoms(school: School, placements: list[dict], among: set[int]) -> set[int]:
    slots: dict[str, set[tuple[int, int]]] = defaultdict(set)
    for p in placements:
        slots[p["lesson"]].add((p["day"], p["period"]))
    out = set()
    for i in among:
        seen: set[tuple[int, int]] = set()
        for k in school.atoms[i][0]:
            if seen & slots[k]:
                out.add(i)
                break
            seen |= slots[k]
    return out


def solve(
    school: School,
    time_limit: float = 3600,
    workers: int = 8,
    seed: int = 0,
    log=print,
    explain: bool = True,
    previous: list[dict] | None = None,
    joint_rooms: bool = False,
) -> Result:
    """Two stages when the pupil rule is hard. Stage 1 looks only for clash-free pupils, up
    to 3/4 of the time. Stage 2 keeps that and improves teachers' days. Clashes are allowed
    only for provably impossible lists; any other clash left is reported as a failure.
    joint_rooms: rooms are part of the time model (solver/joint.py) — the times always leave
    a room for every lesson, and stage 2 weighs room preferences against teachers' days."""
    from .joint import chosen_rooms, hints_from_rooms, room_hints

    started = time.time()
    log(f"building model: {len(school.lessons)} lessons, {len(school.atoms)} atoms, {len(school.teachers)} teachers")
    hints = hints_from_placements(school, previous) if previous else {}
    rhints = hints_from_rooms(school, previous) if previous and joint_rooms else {}
    hard_rooms, cost_rooms = ("hard", "costs") if joint_rooms and school.rooms else ("off", "off")
    if hard_rooms != "off":
        log(f"  rooms inside the time model: {len(school.rooms)} rooms")
    if previous:
        log(f"  warm start from {len(previous)} placed periods")
    impossible = impossible_atoms(school)
    pupils_hard = school.rule("S1").mode == "HARD"
    unresolved: set[int] = set()
    first: list[dict] = []

    if pupils_hard:
        quiet = School(**{**school.__dict__})
        quiet.rules = dict(school.rules)
        for code in ("T2", "G1"):  # comfort rules wait for stage 2; a hard one is a rule of stage 1 too
            if school.rule(code).mode != "HARD":
                quiet.rules[code] = type(school.rules[code])(code, "OFF", 1, {})
        if school.rule("B1").mode != "HARD":  # shapes come back in stage 2
            quiet.rules["B1"] = type(school.rules["B1"])("B1", "SOFT", 0, {})
        possible = set(school.atoms) - set(impossible)
        m = build(quiet, soft_atoms=possible, ignore_atoms=set(impossible), hints=hints, rooms=hard_rooms, room_hints=rhints)
        log(f"stage 1: clash-free pupils ({len(possible)} groups of pupils, {len(impossible)} impossible lists set aside)")
        solver = _solver(time_limit * 0.75, workers, seed)
        status = solver.Solve(m.cp, _StopAtZero(log))
        name = solver.StatusName(status)
        if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            log(f"stage 1 {name} after {time.time() - started:.0f}s")
            res = Result(status=name, seconds=time.time() - started)
            if status == cp_model.INFEASIBLE and explain:
                res.explanation = explain_infeasibility(school, log=log, rooms=hard_rooms)
            return res
        first = extract(m, solver)
        unresolved = _clashing_atoms(school, first, possible)
        log(f"stage 1 done in {time.time() - started:.0f}s: {sum(len(school.atoms[i][1]) for i in unresolved)} pupils still clash")
        hints = hints_from_placements(school, first)
        if m.z:
            rhints = room_hints(m, solver)

    soft = set(impossible) | unresolved
    school.soft_atoms = set(impossible)
    m = build(school, soft_atoms=soft, hints=hints, rooms=cost_rooms, room_hints=rhints)
    for n in dict.fromkeys(school.notes):
        log(f"  note: {n}")
    log(f"stage 2: teachers' days. {len(m.units)} units, {sum(len(u.blocks) for u in m.units)} blocks, {len(m.x)} placement variables" + (f", {len(m.z)} room choices" if m.z else ""))
    solver = _solver(max(60.0, time_limit - (time.time() - started)), workers, seed)
    status = solver.Solve(m.cp, _Progress(log))
    name = solver.StatusName(status)
    refs_of = lambda atoms: {i: school.atoms[i][1] for i in atoms}  # noqa: E731
    res = Result(status=name, seconds=time.time() - started, contradictory_atoms=refs_of(impossible), unresolved_atoms=refs_of(unresolved))
    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        res.placements = extract(m, solver)
        res.rooms = chosen_rooms(m, solver)
        res.objective = solver.ObjectiveValue()
        res.bound = solver.BestObjectiveBound()
        res.penalties = {group: sum(1 for _w, v in items if solver.Value(v)) for group, items in m.penalties.items()}
        log(f"{name}: objective {res.objective:.0f}, penalties {res.penalties}, {res.seconds:.0f}s")
        return res
    log(f"stage 2 {name} after {res.seconds:.0f}s")
    if first:  # keep what stage 1 achieved rather than lose it
        res.status = "FEASIBLE"
        res.placements = first
        return res
    if status == cp_model.INFEASIBLE and explain:
        res.explanation = explain_infeasibility(school, log=log, rooms=hard_rooms)
    return res


def explain_infeasibility(school: School, probe_seconds: float = 60, workers: int = 8, log=print, rooms: str = "off") -> list[str]:
    """Relax one hard group at a time; report which relaxations make the model feasible."""
    findings = []
    log("looking for the conflicting rules …")
    for code in RELAXABLE:
        if code == "ROOMS" and rooms == "off":
            continue
        try:
            m = build(school, relax={code}, rooms=rooms)
        except ValueError as e:
            findings.append(f"relaxing {code}: cannot build ({e})")
            continue
        solver = _solver(probe_seconds, workers, 0)
        status = solver.Solve(m.cp)
        name = solver.StatusName(status)
        log(f"  without {code}: {name}")
        if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            findings.append(f"feasible when {code} is relaxed")
    if not findings:
        findings.append("no single relaxation restores feasibility — check the data problems and the locks")
    return findings
