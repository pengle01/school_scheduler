"""Room phase on the miniature school: ONLY lists, room types, capacity, consistency."""

import json

from solver.data import load
from solver.rooms import apply_rooms, assign_rooms, candidates
from solver.solve import solve
from solver.verify import verify
from solver.tests.test_solver import mini_school


def with_rooms(tmp_path):
    path = mini_school(tmp_path)
    doc = json.loads(path.read_text(encoding="utf-8"))
    doc["rooms"] = [
        {"name": "10", "kind": "Αίθουσα", "capacity": 24, "note": None},
        {"name": "11", "kind": "Αίθουσα", "capacity": 24, "note": None},
        {"name": "12", "kind": "Αίθουσα", "capacity": 4, "note": None},
        {"name": "ΕΡΓ1", "kind": "Εργαστήριο", "capacity": 16, "note": None},
        {"name": "ΕΡΓ2", "kind": "Εργαστήριο", "capacity": 16, "note": None},
    ]
    for l in doc["lessons"]:
        l["roomMode"], l["roomKind"], l["rooms"] = "ANY", None, []
    by = {l["key"]: l for l in doc["lessons"]}
    by["L01"].update(roomMode="PREFER", rooms=["11", "10"])  # maths prefers 11
    by["L11"].update(roomMode="ONLY", rooms=["ΕΡΓ1"])  # the workshop only in ΕΡΓ1
    by["L09"].update(roomKind="Εργαστήριο")  # CAD in any lab
    by["L02"].update(roomMode="PREFER", rooms=["10", "11", "12"], sameRoom=True)  # Greek: one room for all 4 periods
    path.write_text(json.dumps(doc, ensure_ascii=False), encoding="utf-8")
    return path


def test_candidates(tmp_path):
    s = load(with_rooms(tmp_path))
    rooms, cost = candidates(s, s.lessons["L01"])
    assert cost["11"] == 0 and cost["10"] == 2
    assert cost["12"] > cost["10"]  # capacity 4 < 6 pupils: allowed but penalised
    only, _ = candidates(s, s.lessons["L11"])
    assert only == ["ΕΡΓ1"]
    lab, _ = candidates(s, s.lessons["L09"])
    assert set(lab) == {"ΕΡΓ1", "ΕΡΓ2"}


def test_rooms_assigned_and_verified(tmp_path):
    s = load(with_rooms(tmp_path))
    res = solve(s, time_limit=20, workers=4, log=lambda *_: None, explain=False)
    assert res.placements
    rr = assign_rooms(s, res.placements, time_limit=20, workers=4, log=lambda *_: None)
    assert rr.status in ("OPTIMAL", "FEASIBLE") and not rr.unplaceable
    placements = apply_rooms(res.placements, rr.rooms)
    assert all(p["room"] for p in placements)
    violations = verify(s, placements)
    assert [v for v in violations if v.hard] == []
    rooms_of = lambda key: {p["room"] for p in placements if p["lesson"] == key}  # noqa: E731
    assert rooms_of("L11") == {"ΕΡΓ1"}
    assert rooms_of("L09") <= {"ΕΡΓ1", "ΕΡΓ2"}
    assert rooms_of("L01") == {"11"}  # first preference, consistent across blocks
    assert len(rooms_of("L02")) == 1 and rooms_of("L02") <= {"10", "11", "12"}  # sameRoom: one room, from its list
    # no two lessons share a room at a slot
    seen = {}
    for p in placements:
        k = (p["room"], p["day"], p["period"])
        assert k not in seen, (k, seen.get(k), p["lesson"])
        seen[k] = p["lesson"]


def test_same_room_is_hard(tmp_path):
    s = load(with_rooms(tmp_path))
    l = s.lessons["L02"]
    assert l.same_room
    placements = [{"lesson": "L02", "day": d, "period": 1, "room": r} for d, r in ((1, "10"), (2, "11"), (3, "10"), (4, "10"))]
    bad = [v for v in verify(s, placements) if v.code == "SAMEROOM"]
    assert bad and bad[0].hard
