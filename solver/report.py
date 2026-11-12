"""Timetable outputs: JSON (the result) and xlsx grids per teacher and per home group."""

from __future__ import annotations

import json
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

from .data import School
from .solve import Result
from .verify import Violation, summary

DAY_NAMES = ["Δευτέρα", "Τρίτη", "Τετάρτη", "Πέμπτη", "Παρασκευή", "Σάββατο", "Κυριακή"]


def write_json(path: Path, school: School, source: str, res: Result) -> None:
    doc = {
        "format": "school-scheduler-timetable",
        "version": 1,
        "source": source,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "status": res.status,
        "objective": res.objective,
        "bound": res.bound,
        "penalties": res.penalties,
        "contradictoryPupils": sorted(r for refs in res.contradictory_atoms.values() for r in refs),
        "unresolvedPupils": sorted(r for refs in res.unresolved_atoms.values() for r in refs),
        "rules": {code: {"mode": r.mode, "weight": r.weight} for code, r in school.rules.items()},
        "seconds": round(res.seconds, 1),
        # what identifies each lesson, so the app can attach the result without relying on key order
        "lessons": {
            k: {
                "excused": sorted(r for r, keys in school.excused.items() if k in keys),
                "subject": l.subject,
                "level": l.level,
                "homeGroups": l.home_groups,
                "teacher": l.teacher,
                "periods": l.periods,
                "audience": l.audience,
                "students": l.students if l.audience == "SUBSET" else None,
                "band": l.band,
            }
            for k, l in school.lessons.items()
        },
        "placements": res.placements,
    }
    path.write_text(json.dumps(doc, ensure_ascii=False, indent=1), encoding="utf-8")


def read_placements(path: Path) -> list[dict]:
    doc = json.loads(Path(path).read_text(encoding="utf-8"))
    if doc.get("format") != "school-scheduler-timetable":
        raise ValueError("not a school-scheduler timetable file")
    return doc["placements"]


def _identity(subject, level, groups, teacher, periods, audience, students, band, excused=()) -> tuple:
    return (subject, level, tuple(sorted(groups)), teacher, periods, audience, tuple(sorted(students or ())) if audience == "SUBSET" else (), band, tuple(sorted(excused or ())))


def read_hint(path: Path, school: School) -> tuple[list[dict], int]:
    """A previous timetable as a starting point. Keys follow each file's own export order, so
    lessons are matched by content: through the timetable's `lessons` map, or its `source` file.
    Returns the placements under the current keys and how many lessons could not be matched."""
    doc = json.loads(Path(path).read_text(encoding="utf-8"))
    if doc.get("format") != "school-scheduler-timetable":
        raise ValueError("not a school-scheduler timetable file")
    theirs = doc.get("lessons")
    if theirs is None:
        source = doc.get("source")
        if not source or not Path(source).exists():
            raise ValueError(f"{path}: no lesson list and no source file, it cannot be matched to these lessons")
        raw = json.loads(Path(source).read_text(encoding="utf-8"))
        theirs = {l["key"]: dict(l, excused=[]) for l in raw["lessons"]}
        for s in raw["students"]:
            for k in s.get("excusedFrom") or []:
                if k in theirs:
                    theirs[k]["excused"].append(s.get("externalId") or s["name"])
    pool: dict[tuple, list[str]] = {}
    for k in sorted(school.lessons):
        l = school.lessons[k]
        pool.setdefault(_identity(l.subject, l.level, l.home_groups, l.teacher, l.periods, l.audience, l.students, l.band, [r for r, keys in school.excused.items() if k in keys]), []).append(k)
    mapping: dict[str, str] = {}
    unmatched = 0
    for k in sorted(theirs):
        t = theirs[k]
        ids = pool.get(_identity(t["subject"], t.get("level", "NONE"), t["homeGroups"], t.get("teacher"), t["periods"], t.get("audience", "ALL"), t.get("students"), t.get("band"), t.get("excused")))
        if ids:
            mapping[k] = ids.pop(0)
        else:
            unmatched += 1
    return [{**p, "lesson": mapping[p["lesson"]]} for p in doc["placements"] if p["lesson"] in mapping], unmatched


def _safe_title(name: str) -> str:
    bad = '[]:*?/\\'
    t = "".join("_" if c in bad else c for c in name)
    return t[:31]


def _grid_sheet(wb: Workbook, title: str, school: School, cells: dict[tuple[int, int], list[str]]) -> None:
    ws = wb.create_sheet(_safe_title(title))
    ws["A1"] = title
    ws["A1"].font = Font(bold=True, size=12)
    head_fill = PatternFill("solid", fgColor="E2E8F0")
    ws.cell(row=2, column=1, value="").fill = head_fill
    for d in school.days:
        c = ws.cell(row=2, column=d + 1, value=DAY_NAMES[d - 1])
        c.font = Font(bold=True)
        c.fill = head_fill
        c.alignment = Alignment(horizontal="center")
        ws.column_dimensions[get_column_letter(d + 1)].width = 34
    maxp = max(school.days_periods)
    for p in range(1, maxp + 1):
        c = ws.cell(row=2 + p, column=1, value=f"{p}η")
        c.font = Font(bold=True)
        c.fill = head_fill
        for d in school.days:
            cell = ws.cell(row=2 + p, column=d + 1)
            if p > school.last_period(d):
                cell.fill = PatternFill("solid", fgColor="F1F5F9")
                continue
            lines = cells.get((d, p), [])
            cell.value = "\n".join(lines)
            cell.alignment = Alignment(wrap_text=True, vertical="top")
        ws.row_dimensions[2 + p].height = 34
    ws.column_dimensions["A"].width = 5
    ws.freeze_panes = "B3"


def write_xlsx(path: Path, school: School, placements: list[dict], violations: list[Violation]) -> None:
    wb = Workbook()
    wb.remove(wb.active)
    slots_of: dict[str, list[tuple[int, int]]] = defaultdict(list)
    room_of: dict[tuple[str, int, int], str] = {}
    for p in placements:
        slots_of[p["lesson"]].append((p["day"], p["period"]))
        if p.get("room"):
            room_of[(p["lesson"], p["day"], p["period"])] = p["room"]
    rm = lambda key, s: (f" @{room_of[(key, *s)]}" if (key, *s) in room_of else "")  # noqa: E731

    # Σύνοψη
    ws = wb.create_sheet("Σύνοψη")
    ws.append(["Καθηγητής", "Περίοδοι", "Τελευταίες", "Ημέρες με ≥3 συνεχόμενες", "Ημέρες με κενά", "Μέγιστο/ημέρα", "Αίθουσες"])
    for c in ws[1]:
        c.font = Font(bold=True)
    for t in sorted(school.teachers):
        days: dict[int, list[int]] = defaultdict(list)
        for l in school.lessons.values():
            if l.teacher == t:
                for d, p in slots_of.get(l.key, []):
                    days[d].append(p)
        if not days:
            continue
        total = sum(len(v) for v in days.values())
        last = sum(1 for d, ps in days.items() if school.last_period(d) in ps)
        runs3 = gaps = 0
        for ps in days.values():
            ps.sort()
            run = 1
            longest = 1
            for a, b in zip(ps, ps[1:]):
                run = run + 1 if b == a + 1 else 1
                longest = max(longest, run)
            if longest >= 3:
                runs3 += 1
            if ps[-1] - ps[0] + 1 > len(ps):
                gaps += 1
        rooms_used = {room_of[(l.key, *s)] for l in school.lessons.values() if l.teacher == t for s in slots_of.get(l.key, []) if (l.key, *s) in room_of}
        ws.append([t, total, last, runs3, gaps, max(len(v) for v in days.values()), len(rooms_used) or ""])
    ws.column_dimensions["A"].width = 28
    ws.freeze_panes = "A2"

    # Παραβάσεις
    ws = wb.create_sheet("Παραβάσεις")
    ws.append(["Κωδικός", "Αυστηρός", "Περιγραφή"])
    for c in ws[1]:
        c.font = Font(bold=True)
    for v in violations:
        ws.append([v.code, "ναι" if v.hard else "όχι", v.message])
    ws.column_dimensions["C"].width = 90
    counts = summary(violations)
    ws.append([])
    ws.append(["Σύνολο", "", ", ".join(f"{k}: {n}" for k, n in sorted(counts.items())) or "καμία"])

    # Per home group
    for g in sorted(school.home_groups):
        cells: dict[tuple[int, int], list[str]] = defaultdict(list)
        for l in school.lessons.values():
            if g in l.home_groups:
                tag = "" if l.audience == "ALL" else f" [{l.support_kind or 'ομάδα'} {len(l.students)}μ]"
                for s in slots_of.get(l.key, []):
                    cells[s].append(f"{l.subject}{tag} · {l.teacher or 'κενή'}{rm(l.key, s)}")
        _grid_sheet(wb, f"Τμήμα {g}", school, cells)

    # Per teacher
    for t in sorted(school.teachers):
        cells = defaultdict(list)
        for l in school.lessons.values():
            if l.teacher == t:
                for s in slots_of.get(l.key, []):
                    cells[s].append(f"{'+'.join(l.home_groups)} · {l.subject}{rm(l.key, s)}")
        if cells:
            _grid_sheet(wb, t, school, cells)

    # Per room (only when rooms were assigned)
    if room_of:
        by_room: dict[str, dict[tuple[int, int], list[str]]] = defaultdict(lambda: defaultdict(list))
        for (key, d, p), r in room_of.items():
            l = school.lessons.get(key)
            if l:
                by_room[r][(d, p)].append(f"{'+'.join(l.home_groups)} · {l.subject} · {l.teacher or 'κενή'}")
        ws = wb.create_sheet("Αίθουσες")
        ws.append(["Αίθουσα", "Τύπος", "Χωρητικότητα", "Περίοδοι σε χρήση", "από " + str(len(school.slots()))])
        for c in ws[1]:
            c.font = Font(bold=True)
        for name in sorted(school.rooms):
            r = school.rooms[name]
            ws.append([name, r.kind or "", r.capacity or "", len(by_room.get(name, {})), ""])
        for name in sorted(by_room):
            _grid_sheet(wb, f"Αίθ. {name}", school, by_room[name])

    wb.save(path)
