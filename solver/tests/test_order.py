"""Rule O1: a lesson comes after the lessons entered on it (Lesson.after)."""

import json

from solver.data import load, order_sets, order_violations
from solver.solve import solve
from solver.tests.test_solver import L, mini_school
from solver.verify import verify


def with_parts(tmp_path, joint_periods=3, joint_shape="1+1+1"):
    # Physics: Φ teaches ΗΥ1 and ΕΓ1 on their own (2 periods each) and together.
    path = mini_school(tmp_path)
    doc = json.loads(path.read_text(encoding="utf-8"))
    by = {l["key"]: l for l in doc["lessons"]}
    by["L08"].update(periods=joint_periods, shape=joint_shape, after=["L14", "L15"])
    doc["lessons"] += [L("L14", "Φυσική", ["ΗΥ1"], "Φ", 2, "1+1"), L("L15", "Φυσική", ["ΕΓ1"], "Φ", 2, "1+1")]
    path.write_text(json.dumps(doc, ensure_ascii=False), encoding="utf-8")
    return path


def test_sets_are_the_entered_links(tmp_path):
    s = load(with_parts(tmp_path))
    assert order_sets(s) == [("L08", ["L14", "L15"])]
    s.lessons["L08"].after = []
    assert order_sets(s) == []  # nothing is guessed from subject or teacher


def test_order_violations():
    part = [(1, 2), (3, 1)]
    assert order_violations([(1, 3), (3, 4), (5, 1)], part) == 0  # α · joint · α · joint · joint
    assert order_violations([(1, 1), (3, 4), (5, 1)], part) == 1  # first joint before the first α
    assert order_violations([(1, 3), (2, 1), (5, 1)], part) == 1  # second joint before the second α


def test_solver_keeps_the_order(tmp_path):
    s = load(with_parts(tmp_path))
    res = solve(s, time_limit=20, workers=4, log=lambda *_: None, explain=False)
    assert res.placements
    slots = lambda k: [(p["day"], p["period"]) for p in res.placements if p["lesson"] == k]  # noqa: E731
    for part in ("L14", "L15"):
        assert order_violations(slots("L08"), slots(part)) == 0
    assert [v for v in verify(s, res.placements) if v.code == "O1"] == []


def test_verify_reports_wrong_order(tmp_path):
    s = load(with_parts(tmp_path))
    placements = [
        {"lesson": "L08", "day": 1, "period": 1}, {"lesson": "L08", "day": 2, "period": 1}, {"lesson": "L08", "day": 3, "period": 1},
        {"lesson": "L14", "day": 4, "period": 1}, {"lesson": "L14", "day": 5, "period": 1},
    ]
    bad = [v for v in verify(s, placements) if v.code == "O1"]
    assert len(bad) == 1 and bad[0].hard  # L14 after L08; L15 not placed, nothing to compare
    s.rules["O1"].mode = "SOFT"
    assert not [v for v in verify(s, placements) if v.code == "O1"][0].hard
