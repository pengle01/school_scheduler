"""CLI:
  python -m solver solve  <data.json> [--out data/timetable-26-27] [--time 600] [--workers 8] [--seed 0]
  python -m solver verify <data.json> <timetable.json>
  python -m solver check  <data.json>            # data problems only
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from .data import data_problems, impossible_atoms, load
from .report import read_hint, read_placements, write_json, write_xlsx
from .rooms import apply_rooms, assign_rooms
from .solve import solve
from .verify import summary, verify


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="solver")
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("solve")
    s.add_argument("data")
    s.add_argument("--out", default=None, help="output base path (default: data/timetable-<data name>)")
    s.add_argument("--time", type=float, default=3600)
    s.add_argument("--workers", type=int, default=8)
    s.add_argument("--seed", type=int, default=0)
    s.add_argument("--no-explain", action="store_true")
    s.add_argument("--room-time", type=float, default=120, help="seconds for the room phase (0 = skip)")
    s.add_argument("--hint", default=None, help="a previous timetable JSON to start from")
    r = sub.add_parser("rooms", help="assign rooms to an existing timetable")
    r.add_argument("data")
    r.add_argument("timetable")
    r.add_argument("--out", default=None)
    r.add_argument("--time", type=float, default=120)
    r.add_argument("--workers", type=int, default=8)
    v = sub.add_parser("verify")
    v.add_argument("data")
    v.add_argument("timetable")
    c = sub.add_parser("check")
    c.add_argument("data")
    args = ap.parse_args(argv)

    school = load(args.data)
    problems = data_problems(school)
    for p in problems:
        print("data:", p)
    for i, why in impossible_atoms(school).items():
        refs = school.atoms[i][1]
        print(f"impossible pupil list ({len(refs)}): {', '.join(refs)}: {why}")

    if args.cmd == "check":
        print(f"{len(school.lessons)} lessons, {len(school.atoms)} atoms, {len(school.teachers)} teachers, {len(problems)} problems")
        return 1 if problems else 0

    if args.cmd == "rooms":
        placements = read_placements(Path(args.timetable))
        # keep the rule modes the timetable was solved with (e.g. pupils made soft)
        import json as _json

        for code, r in (_json.loads(Path(args.timetable).read_text(encoding="utf-8")).get("rules") or {}).items():
            if code in school.rules:
                school.rules[code].mode, school.rules[code].weight = r["mode"], r["weight"]
        rr = assign_rooms(school, placements, time_limit=args.time, workers=args.workers)
        for u in rr.unplaceable:
            print("no candidate room:", u)
        if not rr.rooms:
            return 3
        placements = apply_rooms(placements, rr.rooms)
        base = Path(args.out) if args.out else Path(args.timetable).with_suffix("")
        from .solve import Result

        res = Result(status=rr.status, placements=placements, objective=rr.objective, penalties={"rooms": sum(rr.penalties.values())}, seconds=rr.seconds)
        write_json(base.with_suffix(".json"), school, str(args.data), res)
        violations = verify(school, placements)
        write_xlsx(base.with_suffix(".xlsx"), school, placements, violations)
        hard = [x for x in violations if x.hard]
        print("verify:", summary(violations) or "none", "| hard:", len(hard))
        for x in hard[:20]:
            print(f"  {x.code}: {x.message}")
        print(f"written {base.with_suffix('.json')} and {base.with_suffix('.xlsx')}")
        return 1 if hard else 0

    if args.cmd == "verify":
        placements = read_placements(Path(args.timetable))
        violations = verify(school, placements)
        hard = [x for x in violations if x.hard]
        print("violations:", summary(violations) or "none")
        for x in hard[:40]:
            print(f"  {x.code}: {x.message}")
        return 1 if hard else 0

    if problems:
        print("fix the data problems above first")
        return 2
    previous = None
    if args.hint:
        previous, unmatched = read_hint(Path(args.hint), school)
        print(f"starting from {args.hint}: {len(previous)} periods" + (f", {unmatched} lessons changed since" if unmatched else ""))
    res = solve(school, time_limit=args.time, workers=args.workers, seed=args.seed, explain=not args.no_explain, previous=previous)
    if res.explanation:
        for e in res.explanation:
            print("explain:", e)
    if res.unresolved_atoms:
        n = sum(len(r) for r in res.unresolved_atoms.values())
        print(f"NOT ACCEPTABLE: {n} pupils still clash although their lists are possible. Run longer with --hint on this result.")
    if not res.placements:
        return 3
    if args.room_time > 0 and school.rooms:
        rr = assign_rooms(school, res.placements, time_limit=args.room_time, workers=args.workers)
        for u in rr.unplaceable:
            print("no candidate room:", u)
        if rr.rooms:
            res.placements = apply_rooms(res.placements, rr.rooms)
            res.penalties = {**res.penalties, "rooms": sum(rr.penalties.values())}
    base = Path(args.out) if args.out else Path("data") / f"timetable-{Path(args.data).stem.replace('orologio-', '')}"
    base.parent.mkdir(parents=True, exist_ok=True)
    write_json(base.with_suffix(".json"), school, str(args.data), res)
    violations = verify(school, res.placements)
    write_xlsx(base.with_suffix(".xlsx"), school, res.placements, violations)
    hard = [x for x in violations if x.hard]
    print("verify:", summary(violations) or "none", "| hard:", len(hard))
    for x in hard[:20]:
        print(f"  {x.code}: {x.message}")
    print(f"written {base.with_suffix('.json')} and {base.with_suffix('.xlsx')}")
    print(f"to browse it in the app:  npm run import:timetable -- {base.with_suffix('.json')}")
    return 1 if hard else 0


if __name__ == "__main__":
    sys.exit(main())
