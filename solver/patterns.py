"""Scheduling units, their blocks and the placements each block may take.

A unit is what gets placed: a lesson, or a band (all its options share one placement).
A block is a run of consecutive periods within one day; a placement is (day, start)."""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field

from .data import Lesson, School, fit_shape


@dataclass(frozen=True)
class Placement:
    day: int
    start: int
    length: int

    @property
    def slots(self) -> list[tuple[int, int]]:
        return [(self.day, self.start + i) for i in range(self.length)]


@dataclass
class Block:
    unit: str
    index: int
    length: int
    placements: list[Placement] = field(default_factory=list)
    required: int | None = None  # exactly this many runs; None = free choice (flexible unit)


@dataclass
class Unit:
    id: str
    lessons: list[Lesson]  # one lesson, or all options of a band
    blocks: list[Block]
    teachers: list[str]  # with multiplicity (a teacher in two options appears twice)
    long: bool
    band: str | None
    shape: list[int] = field(default_factory=list)  # the declared shape the unit should follow
    flexible: bool = False  # B1 soft: other splits of the same periods are allowed, at a cost

    @property
    def label(self) -> str:
        return self.lessons[0].label if len(self.lessons) == 1 else f"ζώνη {self.band}"

    @property
    def periods(self) -> int:
        return sum(self.shape)


def band_shape(options: list[Lesson]) -> list[int]:
    """Options of a band may carry different declared shapes; the band takes the most
    common one among options with the band's period count."""
    periods = Counter(l.periods for l in options).most_common(1)[0][0]
    shapes = Counter(tuple(l.shape) for l in options if l.periods == periods)
    return list(shapes.most_common(1)[0][0])


def runs(slots: list[tuple[int, int]]) -> list[Placement]:
    """Contiguous runs of locked slots → fixed placements."""
    out: list[Placement] = []
    for day in sorted({d for d, _ in slots}):
        ps = sorted(p for d, p in slots if d == day)
        start, prev = ps[0], ps[0]
        for p in ps[1:]:
            if p == prev + 1:
                prev = p
                continue
            out.append(Placement(day, start, prev - start + 1))
            start = prev = p
        out.append(Placement(day, start, prev - start + 1))
    return out


def build_units(school: School, ignore_locks: bool = False, ignore_unavailable: bool = False, split_bands: bool = False) -> list[Unit]:
    units: list[Unit] = []
    seen_bands: set[str] = set()
    for lesson in school.lessons.values():
        if lesson.band and not split_bands:
            if lesson.band in seen_bands:
                continue
            seen_bands.add(lesson.band)
            options = school.band_lessons(lesson.band)
            shape = band_shape(options)
            unit = Unit(
                id=f"band:{lesson.band}",
                lessons=options,
                blocks=[],
                teachers=[o.teacher for o in options if o.teacher],
                long=any(o.long for o in options),
                band=lesson.band,
            )
            # The zone grid locks the band; otherwise a locked option locks it.
            fixed = school.bands.get(lesson.band, {}).get("slots") or next((o.fixed_slots for o in options if o.fixed_slots), [])
        else:
            unit = Unit(id=lesson.key, lessons=[lesson], blocks=[], teachers=[lesson.teacher] if lesson.teacher else [], long=lesson.long, band=None)
            shape = lesson.shape
            fixed = lesson.fixed_slots
        unavailable: set[tuple[int, int]] = set()
        if not ignore_unavailable:
            for t in unit.teachers:
                unavailable |= school.teachers[t].unavailable if t in school.teachers else set()
        # Fewer available days than blocks (a teacher present one or two days a week):
        # merge the smallest chunks so the lesson still fits on different days.
        if not fixed:
            free_days = [d for d in school.days if any((d, p) not in unavailable for p in school.periods(d))]
            if len(shape) > len(free_days) and free_days:
                merged = fit_shape(shape, len(free_days))
                school.notes.append(f"{unit.label}: {'+'.join(map(str, shape))} → {'+'.join(map(str, merged))} (teacher available {len(free_days)} days)")
                shape = merged
        unit.shape = list(shape)
        if fixed and not ignore_locks:
            # Locked: exactly the recorded days/periods, one placement per run.
            for i, pl in enumerate(runs(fixed)):
                unit.blocks.append(Block(unit.id, i, pl.length, [pl], required=1))
            unit.shape = [pl.length for pl in runs(fixed)]
        else:
            # A lesson with locks keeps the block lengths of its locked runs even when the
            # locks are relaxed (a 7-period workshop stays one 7-period block).
            if fixed:
                shape = [pl.length for pl in runs(fixed)]
                unit.shape = list(shape)
            counts = Counter(shape)
            # B1 is soft: a double may become two singles and two singles a double, as the
            # school's own timetable does. Long lessons and locked runs stay whole.
            unit.flexible = school.rule("B1").mode != "HARD" and not unit.long and not fixed
            lengths = sorted(set(shape) | ({1, min(2, sum(shape))} if unit.flexible else set()))
            for length in lengths:
                block = Block(unit.id, length, length, required=None if unit.flexible else counts[length])
                for day in school.days:
                    last = school.last_period(day)
                    for start in range(1, last - length + 2):
                        pl = Placement(day, start, length)
                        if any(s in unavailable for s in pl.slots):
                            continue
                        block.placements.append(pl)
                unit.blocks.append(block)
        units.append(unit)
    return units


def unit_of_lesson(units: list[Unit]) -> dict[str, Unit]:
    index: dict[str, Unit] = {}
    for u in units:
        for l in u.lessons:
            index[l.key] = u
    return index
