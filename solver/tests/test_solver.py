"""A miniature school exercising every structure: French block with ΣΤ + ΑΣΤ, a band, a
merged lesson, a locked workshop, a teacher unavailable on Monday."""

import json

import pytest

from solver.data import data_problems, load, impossible_atoms, overbooked_atoms
from solver.model import build
from solver.patterns import build_units
from solver.solve import explain_infeasibility, solve
from solver.verify import verify


def mini_school(tmp_path, *, clash=False):
    pupils = [f"P{n}" for n in range(1, 11)]  # P1-P6 in ΗΥ1, P7-P10 in ΕΓ1
    lessons = [
        # plain lessons of ΗΥ1
        L("L01", "Μαθηματικά", ["ΗΥ1"], "Μ", 3, "2+1"),
        L("L02", "Νέα Ελληνικά", ["ΗΥ1"], "Ε", 4, "2+1+1"),
        # French block: P1-P3 take French, P4/P5 in ΣΤ Greek during it, P6 pulled out for Maths
        L("L03", "Γαλλικά", ["ΗΥ1"], "Γ", 2, "1+1", audience="SUBSET", students=["P1", "P2", "P3"]),
        L("L04", "Νέα Ελληνικά", ["ΗΥ1"], "Ε2", 1, "1", audience="SUBSET", students=["P4", "P5"], during="L03", supportKind="ST"),
        L("L05", "Μαθηματικά", ["ΗΥ1"], "Μ2", 1, "1", audience="SUBSET", students=["P6"], during="L03", supportKind="AST"),
        # Religion for everyone, P6 pulled out once more (listed in Religion too: support wins)
        L("L06", "Θρησκευτικά", ["ΗΥ1"], "Θ", 1, "1"),
        L("L07", "Φυσική", ["ΗΥ1"], "Φ", 1, "1", audience="SUBSET", students=["P6"], during="L06", supportKind="AST"),
        # merged Physics for both groups
        L("L08", "Φυσική", ["ΗΥ1", "ΕΓ1"], "Φ", 2, "2"),
        # band over both groups: CAD (P1,P2,P7) ∥ CNC (P3,P4,P8,P9)
        L("L09", "CAD", ["ΗΥ1", "ΕΓ1"], "Τ1", 2, "2", audience="SUBSET", students=["P1", "P2", "P7"], band="ΑΠ1ΕΠΙΛ"),
        L("L10", "CNC", ["ΗΥ1", "ΕΓ1"], "Τ2", 2, "1+1", audience="SUBSET", students=["P3", "P4", "P8", "P9"], band="ΑΠ1ΕΠΙΛ"),
        # ΕΓ1 lessons, one a locked full-day workshop on Wednesday
        L("L11", "Γραφικές Τέχνες", ["ΕΓ1"], "ΕΓ", 7, "1+1+1+1+1+1+1", long=True, fixedSlots=[{"day": 3, "periods": [1, 2, 3, 4, 5, 6, 7]}]),
        L("L12", "Μαθηματικά", ["ΕΓ1"], "Μ", 3, "1+1+1"),
        L("L13", "Νέα Ελληνικά", ["ΕΓ1"], "Ε", 2, "2"),
    ]
    if clash:
        # Μ locked twice on the same slot → infeasible
        lessons[0]["fixedSlots"] = [{"day": 2, "periods": [1, 2, 3]}]
        lessons[11]["fixedSlots"] = [{"day": 2, "periods": [1, 2, 3]}]
    doc = {
        "format": "school-scheduler",
        "version": 2,
        "exportedAt": "2026-11-01T00:00:00Z",
        "settings": {"daysPeriods": [8, 7, 7, 8, 7]},
        "teachers": [T(n) for n in ["Μ", "Μ2", "Ε", "Ε2", "Γ", "Θ", "Φ", "Τ1", "Τ2", "ΕΓ"]],
        "subjects": [],
        "homeGroups": [{"name": "ΗΥ1", "year": "A", "direction": "PRACTICE", "note": None}, {"name": "ΕΓ1", "year": "A", "direction": "PRACTICE", "note": None}],
        "students": [{"name": p, "externalId": p, "homeGroup": "ΗΥ1" if int(p[1:]) <= 6 else "ΕΓ1", "gender": "NONE"} for p in pupils],
        "bands": [{"name": "ΑΠ1ΕΠΙΛ", "kind": "ELECTIVE", "note": None}],
        "lessons": lessons,
        "rules": [{"code": "T2", "mode": "SOFT", "weight": 3, "params": {"max": 2}, "overrides": []}],
    }
    # teacher Μ unavailable all Monday
    doc["teachers"][0]["unavailability"] = [{"day": 1, "period": p, "kind": "HARD"} for p in range(1, 9)]
    path = tmp_path / "mini.json"
    path.write_text(json.dumps(doc, ensure_ascii=False), encoding="utf-8")
    return path


def T(name):
    return {"name": name, "firstName": None, "department": None, "obligation": 24, "reduction": 0, "active": True, "note": None, "unavailability": []}


def L(key, subject, groups, teacher, periods, shape, audience="ALL", students=None, during=None, supportKind=None, band=None, long=False, fixedSlots=None):
    return {
        "key": key, "subject": subject, "level": "A", "homeGroups": groups, "teacher": teacher, "periods": periods, "shape": shape,
        "audience": audience, "students": students, "during": during, "supportKind": supportKind, "band": band, "long": long,
        "fixedRoom": None, "fixedSlots": fixedSlots, "note": None,
    }


def test_attendance_and_atoms(tmp_path):
    s = load(mini_school(tmp_path))
    assert data_problems(s) == []
    assert overbooked_atoms(s) == {}
    # P6 leaves French and Religion for its pull-outs; P4 is in ΣΤ Greek and in CNC
    assert s.attendance["P6"] == {"L01", "L02", "L05", "L07", "L08"}
    assert s.attendance["P4"] == {"L01", "L02", "L04", "L06", "L08", "L10"}
    assert s.attendance["P7"] == {"L08", "L09", "L11", "L12", "L13"}
    # pupils with identical lessons share an atom
    atoms = {frozenset(refs) for _, refs in s.atoms.values()}
    assert frozenset(["P1", "P2"]) in atoms


def test_ast_has_no_host_and_its_pupils_are_excused(tmp_path):
    s = load(mini_school(tmp_path))
    assert s.lessons["L04"].during == "L03"  # ΣΤ stays inside French
    assert s.lessons["L05"].during is None and s.lessons["L07"].during is None
    assert sorted(s.excused["P6"]) == ["L03", "L06"]
    assert "L06" not in s.attendance["P6"] and "L06" in s.attendance["P4"]


def test_patterns_respect_locks_and_unavailability(tmp_path):
    s = load(mini_school(tmp_path))
    units = {u.id: u for u in build_units(s)}
    locked = units["L11"]
    assert len(locked.blocks) == 1 and locked.blocks[0].placements[0].slots == [(3, p) for p in range(1, 8)]
    maths = units["L01"]
    assert all(pl.day != 1 for b in maths.blocks for pl in b.placements)  # Μ is away on Monday
    assert maths.shape == [2, 1] and maths.flexible
    assert {b.length for b in maths.blocks} == {1, 2}
    band = units["band:ΑΠ1ΕΠΙΛ"]
    assert band.shape in ([2], [1, 1])
    assert len(band.lessons) == 2


def test_solve_and_verify(tmp_path):
    s = load(mini_school(tmp_path))
    res = solve(s, time_limit=20, workers=4, log=lambda *_: None, explain=False)
    assert res.status in ("OPTIMAL", "FEASIBLE")
    violations = verify(s, res.placements)
    assert [v for v in violations if v.hard] == []
    slots = {}
    for p in res.placements:
        slots.setdefault(p["lesson"], set()).add((p["day"], p["period"]))
    assert slots["L11"] == {(3, p) for p in range(1, 8)}
    assert slots["L04"] <= slots["L03"]  # ΣΤ inside French
    assert slots["L09"] == slots["L10"]
    assert all(d != 1 for d, _ in slots["L01"])


def test_infeasible_is_explained(tmp_path):
    s = load(mini_school(tmp_path, clash=True))
    res = solve(s, time_limit=20, workers=4, log=lambda *_: None, explain=False)
    assert res.status == "INFEASIBLE"
    findings = explain_infeasibility(s, probe_seconds=10, workers=4, log=lambda *_: None)
    assert any("LOCKS" in f for f in findings)


def test_impossible_lists_are_only_the_provable_ones(tmp_path):
    from solver.data import compute_attendance

    s = load(mini_school(tmp_path))
    assert impossible_atoms(s) == {}
    host = s.lessons["L03"]
    extra = [l for l in s.lessons.values() if l.during == host.key]
    assert extra
    pupil = extra[0].students[0]
    for l in extra:
        if pupil not in l.students:
            l.students.append(pupil)
    total = sum(l.periods for l in extra)
    while total <= host.periods:  # enlarge until the supports cannot fit in the host
        extra[0].periods += 1
        total += 1
    compute_attendance(s)
    assert any(pupil in s.atoms[i][1] for i in impossible_atoms(s))


def test_a_clash_of_a_possible_list_is_a_hard_violation(tmp_path):
    s = load(mini_school(tmp_path))
    res = solve(s, time_limit=20, workers=4, log=lambda *_: None, explain=False)
    assert res.unresolved_atoms == {}
    keys, _refs = next((k, r) for k, r in s.atoms.values() if len(k) >= 2)
    a, b = sorted(keys)[:2]
    slot = next((p["day"], p["period"]) for p in res.placements if p["lesson"] == a)
    moved = [dict(p) for p in res.placements]
    next(p for p in moved if p["lesson"] == b).update(day=slot[0], period=slot[1])
    assert any(v.code == "S1" and v.hard for v in verify(s, moved))


def test_declared_shape_is_soft_but_followed_when_nothing_prevents_it(tmp_path):
    s = load(mini_school(tmp_path))
    res = solve(s, time_limit=20, workers=4, log=lambda *_: None, explain=False)
    assert res.penalties.get("B1", 0) == 0
    days = {}
    for p in res.placements:
        if p["lesson"] == "L01":
            days.setdefault(p["day"], []).append(p["period"])
    assert sorted(len(v) for v in days.values()) == [1, 2]  # maths 2+1 on two days


def test_shape_hard_keeps_exact_blocks(tmp_path):
    s = load(mini_school(tmp_path))
    s.rules["B1"].mode = "HARD"
    units = {u.id: u for u in build_units(s)}
    assert not units["L01"].flexible
    assert {b.length: b.required for b in units["L01"].blocks} == {2: 1, 1: 1}


def test_hint_is_matched_by_content_not_by_key(tmp_path):
    from solver.report import read_hint, write_json

    path = mini_school(tmp_path)
    s = load(path)
    res = solve(s, time_limit=20, workers=4, log=lambda *_: None, explain=False)
    tt = tmp_path / "tt.json"
    write_json(tt, s, str(path), res)
    # the same school, its lessons renumbered as another export would
    doc = json.loads(path.read_text(encoding="utf-8"))
    swap = {"L01": "L02", "L02": "L01"}
    for l in doc["lessons"]:
        l["key"] = swap.get(l["key"], l["key"])
        if l.get("during"):
            l["during"] = swap.get(l["during"], l["during"])
    other = tmp_path / "other.json"
    other.write_text(json.dumps(doc, ensure_ascii=False), encoding="utf-8")
    placements, unmatched = read_hint(tt, load(other))
    assert unmatched == 0
    old = sorted((p["day"], p["period"]) for p in res.placements if p["lesson"] == "L01")
    assert sorted((p["day"], p["period"]) for p in placements if p["lesson"] == "L02") == old


def test_build_rejects_block_without_placement(tmp_path):
    s = load(mini_school(tmp_path))
    # teacher Γ never available → French has nowhere to go
    s.teachers["Γ"].unavailable = set(s.slots())
    with pytest.raises(ValueError):
        build(s)
