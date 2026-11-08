# Ωρολόγιο (Orologio) export files — what was decoded (2026-10-22)

Folders `25-26/` and `26-27/` hold one project each from the school's current timetabling
program, "Orologio" (file header `File=Orologio Data`, `Version=17.0`; sub-files 12.5).
Encoding: Windows-1253 (Greek), CRLF. Convert with `iconv -f cp1253 -t utf-8`.

| File | Content | 25-26 | 26-27 |
|---|---|---|---|
| `.DAT` | all master data (below) | 20,207 lines | 23,157 lines |
| `.REL` | lessons = teacher × group × subject × hours | 2,037 rows | 2,250 rows |
| `.RES` | the solved timetable, one row per placed period (see below). Empty in the first exports; filled in `25-26 (1)/` (v136) and `26-27 (1)/` (v119, **the timetable actually running in 2026-27**) | 2,239 rows | 2,363 rows |
| `.REP` | substitutions — empty | – | – |
| `.EXM` | exam timetable — empty | – | – |

## .DAT record types (`<type>#field#field#…#`, 1-based ids = row order unless noted)

| Type | Rows (26-27) | Meaning | Fields that matter |
|---|---|---|---|
| header | | `Days=5`, `Hours=8`, day names Δε…Κυ, period names 1η…24η | the program's grid is 5 × 8 |
| 1 | 2 | buildings (25-26 lists 29 room-number strings here — probably stale) | |
| 2 | 154 | **teachers** | f0 `<dept>-<SURNAME I.>`, f1 first name, f3 specialty code (31100 …), f4 **obligation periods**, f5 colour, f51 external id (not unique), f53 note (e.g. `1 ΩΡΑ ΠΙΣΤΩΣΗ`), f60 active flag (0 = 5 teachers, no lessons), f62 gender Α/Θ |
| 3 | 198 | **classes / pools**: 7 real (f0=0): Ζ1, ΑΠ, ΑΘ, ΒΠ, ΒΘ, ΓΠ, ΓΘ with f2 = number of home groups; 191 "virtual" (f0=1) = **pools: sets of lessons that are scheduled as one unit, always simultaneous** (bands `ΓΠ2ΕΠΙΛ`, year-wide level groups `ΒΠΑΓΓΛ`/`ΒΠΜΑΘ`, French half + its support groups `ΓΑΛ_ΗΥ1_1`, merged groups `ΘΗΨ2α_ΘΗΨ2β`), f2 = number of sub-slots, f3..f10 = class index, f43..f50 = home-group index inside that class, f83 name. Verified on the 26-27 result: every sub-slot of a pool occupies exactly the same periods | |
| 4 | 105 | **rooms**: f0 name, f2 capacity (DUMMY1-5 = virtual; Γ58-Γ61, B123, Β124, Β125α capacity 116 = probably "anywhere"/virtual) | 25-26 has 97 rooms, 10 named differently |
| 5 | 632 | **teacher unavailability**: `teacherIndex(1-based) day period 0` — 65 teachers, max 35 slots; **teacher 0 = whole school** (the 3 rows marking period 8 on Tue/Wed/Fri, i.e. the calendar). Respected 100 % by the real timetable | this is the T1/T5/T6 data the handoff says is "not yet collected" |
| 6 | 619 | **student groups** (home groups, merged `A_B`, electives `ΓΠ1Μ3_1`, support `ΣΤ_…`, `ΑΣΤ_…`, `ΕΞΣΤ_…`, French halves `ΓΑΛ_…_1/2`): f0 id, f1 name, f3 colour, f4 student count, f5 external id (home groups only), f6 ministry subject code of the subject the group is tied to | |
| 7 | 2 | group unavailability `groupId day period` (1-based ids) | |
| 8 | 9 | room unavailability `roomIndex(1-based) day period` | |
| 9 | 1160 | per lesson (REL type 3 row order): 105-bit **allowed-rooms** bitmap (bit i = room row i) | 57 lessons restrict rooms |
| 13 | 619 | per group: `11` or empty (6 groups) — unknown flag | ? |
| 14 | 154 | per teacher: 154-bit teacher×teacher matrix, all zero | unused |
| 17 | 38 | subject categories (Υποχρεωτικά (Α), Κατεύθυνσης (Β) …) with colours | |
| 22 | 1165 | `subjectId studentId*10+1` — students attached to (mostly workshop) subjects | meaning unconfirmed |
| 23 | 191 | `groupId ministrySubjectCode 0` — group runs **together with that subject** of its parent (ΓΑΛ_/ΣΤ_ groups ↔ French 410212080 / 410222080) | = handoff rule "support leaves from French" |
| 24/25/26 | 619/418/154 | per group / subject / teacher: 105-bit room preference, all zero | unused |
| 32 | 24 | `roomIndex roomIndex` pairs (11→17, 12→17, 12→18 …) — room alternatives/links | ? |
| 41 | 619 | per group: same (class, home-group index) pairs as type 3 → which home groups feed the group | |
| 13015 | 418 | **subjects**: f0 name (with level suffix `(ΑΠ)`, `(ΓΘ)`), f1 154-bit "teachers qualified" bitmap, f2 colour, f5 external id, f6 ministry code, f9 short name (Β-year electives), f11 periods/week, f3/f10 flags (set on the Β/Γ common-core electives) | |
| 13121 | 74 | elective groups ("ΕΠΙΛΟΓΗ 1", "36ΤΘΠ (Γ)" …) listing member subjects | |
| 17010 | 901 | **students**: f1 id, f2/f3 external ids, f4 home group (570 blank!), f7 gender, f8 specialty (ΞΕ, ΘΗΨ, ΘΒΣ …) | |
| 17011 | 5388 | `studentId groupId*10+1` — student ∈ group (every one of the 901 students is in ≥1 group) | |
| 17012 | 9323 | `groupId groupId*10+flag` — flag 1 = hierarchy (parent→sub-group or sibling), flag 2 = disjoint-student groups (can run simultaneously, e.g. same band) | |

## .REL record types

- `3# teacher# group# subject# hours# 0# "b1 b2 b3 b4 b5"# 0# 0#` — **the lesson list**
  (1,160 lessons, 2,363 periods in 26-27; 1,059 / ~2,200 in 25-26). teacher = row index
  in type 2, group = type 6 id, subject = row index in 13015. The 5 numbers are the
  **block shape**: hours = sum of a prefix, e.g. hours 5 + `2 1 1 1 1` = 2+1+1+1,
  hours 6 + `3 3 1 1 1` = 3+3. 26 lessons of 6–7 periods carry the default `1 1 1 1 1`
  (hotel workshops, ΗΕ3 electrical workshop, Μαθηματικά Εμβ. 7-ωρο) → shape unknown.
  The two trailing zeros are presumably fixed day/period = **never set**.
- The `(1)` exports contain the same lesson rows in a different order (sorted by teacher).
- `1# teacher# group# hours# 1# "b1…b5"#` — 1,090 rows, teacher×group without subject,
  only ~half of the hours. Looks like an older/auxiliary table; type 3 is authoritative.

## Confirmed by the user (2026-10-22)

- The 12 groups with a `-` suffix (`ΓΞ1Γ-`, `ΑΞΓΑΛα-`, …) are a workaround made in 2025-26
  (each carries a 1-period French lesson beside the real group's 1-period one). Not real
  student groups: the importer must fold them into the group without the `-`.
- REL type 1 (teacher × group × hours, no subject): meaning unknown to the user too; ignore it.

## .RES — the timetable (fixed-width, 26 chars per row, one row per placed period)

```
cols 1-3  day (1=Mon … 5=Fri)
cols 4-6  period (1-8)
cols 7-10 teacher (1-based row in type 2)
cols 11-14 pool/class (1-based row in type 3): ≤7 = real class, >7 = pool
cols 15-18 sub-slot: home-group index inside the class (c ≤ 7) or sub-slot inside the pool
cols 19-21 room (1-based row in type 4)
cols 22-24 subject (1-based row in 13015)
cols 25-26 flag: 00 or 10 (meaning unknown; 193 rows in 26-27, all in pools)
```

The group is not stored; it is recovered from the lesson list (REL type 3) as follows.
For a real class (c ≤ 7) the sub-slot is the index of the home group inside that class,
and the home groups of a class are, in order, the type-6 rows that carry an external id
(f5), skipping merged names — 14 ΑΠ, 11 ΑΘ, 11 ΒΠ, 11 ΒΘ, 11 ΓΠ, 11 ΓΘ in 26-27 — so the
home group is exact. For a pool (c > 7) the lesson's group must belong to the pool: a
home group whose (class, index) is among the pool's members, or a composite group whose
type-41 members are a subset. Teacher + subject + this fit identifies the lesson in all but
84 keys of 26-27, where a teacher teaches the same subject to two groups of the same pool
with the same hours; those are interchangeable for every check (`group_ambiguous` in the
CSV). Every row of both years maps to a lesson; no teacher or room is double-booked; rooms
respect the per-lesson allowed set (1 exception in 25-26). In 25-26 the fit fails for 25
rows of elective groups named with `/` (their type-41 data is missing), so those are
attributed by hours only.

## decoded/ — plain CSV versions

`decoded/timetable_<year>.csv` (day, period, teacher, group, subject, hours, block shape,
room, pool, sub-slot, flag), `decoded/lessons_<year>.csv`, `decoded/teacher_unavailability_<year>.csv`.
Produced by the scratch scripts (parse/res/map/analyse/export); to be redone properly as
`tools/orologio/` in the importer phase.
