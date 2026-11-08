# School Scheduler — Claude Guide

## Project Overview

Data-entry web app for the school timetable solver (teachers, subjects, home groups,
students, lessons with their structures — merges, support during a host lesson, bands —
availability, rules). Model B: the school is described the way the master scheduler does. Greek-first UI (el) with English (en). Same
architecture as `../sms`; read that repo's `CLAUDE.md` for the conventions in depth. No
authentication yet: everything runs on `localhost` for one user.

Background documents: `OROLOGIO-FORMAT.md` (the school's current software's file format, decoded).
Local only, never committed (real names and register numbers): `HANDOFF.md`, `data/`, `decoded/`, the
Orologio year folders, one-off data scripts. Test fixtures and docs use invented names only.

## Tech Stack

| Layer | Library |
|---|---|
| Framework | Next.js 16 App Router (Turbopack) |
| ORM / DB | Prisma 7 (`prisma-client` generator → `src/generated/prisma`) / PostgreSQL via `@prisma/adapter-pg` |
| API | tRPC 11 + React Query 5 (superjson) |
| i18n | next-intl (`messages/el.json`, `messages/en.json`) |
| UI | shadcn/ui (base-nova) + Tailwind v4 + lucide |
| Tests | Vitest (`src/test/unit`) |

## Development

```bash
npm run dev          # http://localhost:3000 → /el/admin/dashboard
npm run test         # unit tests
npm run lint
npm run db:push      # apply schema (no migration files — never `migrate dev`)
npm run db:generate  # then rm -rf .next (stale Turbopack cache otherwise)
```

## Structure

```
src/app/[locale]/(portal)/admin/<page>/page.tsx   server component: title + client component
src/app/[locale]/(portal)/admin/<page>/*.tsx      "use client" tables/forms using tRPC hooks
src/components/EditableTable.tsx                  generic inline-edit table (column spec → inputs)
src/components/layout/                            Sidebar (NAV_ITEMS ↔ messages nav.*), Header (EL/EN)
src/server/db.ts                                  Prisma singleton
src/server/trpc/{init,context,errors}.ts          publicProcedure / adminProcedure (pass-through for now)
src/server/trpc/routers/<domain>.ts               list/byId/create/update/remove + domain extras
src/lib/*.ts                                      pure logic: shape, load, calendar, rulesCatalog, exportFormat (v2 + v1 reader), fixedSlots
src/lib/structure.ts                              model B: upgradeV1 (groups+pools → structures), coverageDuring, bandCheck
src/lib/pupilPeriods.ts, src/lib/timetableFormat.ts  attendance shared with the viewer; solver result schema + lesson matching
src/lib/support.ts, admin/support/                ΣΤ rule check; the Στήριξη screen (per pupil: ΣΤ, ΑΣΤ/ΕΞΣΤ, excusals, total)
src/lib/zoneGrid.ts, admin/zone-grid/             the zone grid (Band.fixedSlots = locks for the whole band) and its checks
src/server/timetable.ts, routers/timetables.ts    attach a solver result (Timetable/Placement rows, keys → lesson ids at import time)
src/components/WeekGrid.tsx, admin/timetable/     the timetable viewer (per teacher/pupil/group/room, click → band/host/supports panel)
src/components/{LessonDialog,LessonTable,StudentPicker}.tsx  the lesson form (all structures), lesson table, pupil checklist
src/lib/orologio/{parse,convert}.ts               Orologio .DAT/.REL/.RES → export JSON (pure, unit-tested)
src/server/import.ts                              applyImport/parseExportFile, shared by the data router and scripts/import-json.mts
scripts/*.mts                                     CLIs run with tsx: orologio-to-json, import-json
solver/                                           Python (.venv, OR-Tools CP-SAT): data.py (load v2 JSON, attendance/atoms), patterns.py (units,
                                                  blocks, placements), model.py, solve.py, rooms.py (room phase), verify.py (independent),
                                                  report.py (JSON + xlsx), tests/
src/trpc/{client,provider,server,types}.ts        client hooks, server caller, RouterOutputs
prisma/schema.prisma                              single source of truth
```

## Key Conventions

- Prisma imports from `@/generated/prisma/client` (never `@prisma/client`).
- `params` is a `Promise` in pages — always `await params`.
- All user-facing strings in BOTH `messages/el.json` and `messages/en.json`; never hard-code Greek in components.
- Server errors carry a short key (`inUse`, `duplicate`, `badShape`, …) translated under `errors.*` via `useErrorToast()`.
- Deleting something still referenced → Prisma P2003 → `rethrowAsConflict` → CONFLICT `inUse`.
- Row types for client tables come from `RouterOutputs["<router>"]["list"][number]` (`src/trpc/types.ts`).
- Do not call `setState` inside `useEffect` to copy server data into local state; use the
  "sync once per fetched value during render" pattern (see `TeacherDetail.tsx`) — the
  `react-hooks/set-state-in-effect` lint rule is an error.
- Pure logic lives in `src/lib` with a unit test for every new function.

## Domain notes

- **HomeGroup** (τμήμα) is the only group the user enters. A **Lesson** targets 1+ home
  groups (`LessonHomeGroup`; 2+ = συνδιδασκαλία) and has `audience` ALL or SUBSET
  (`LessonStudent` names the pupils: French pupils, band options, support).
- **ΣΤ** (`supportKind` ST) runs *during* its French `hostLesson`: one Greek + one Maths period (ministry
  rule, `src/lib/support.ts`). **ΑΣΤ / ΕΞΣΤ** have no host: each pupil has `StudentExcusal` rows (lessons
  given by the ministry) and the 37-period week places the lesson in the freed period. Old files with a
  host on those two are converted by `normalizeSupport` (app) / `normalize_support` (solver).
- **Band** (ζώνη) = lessons that run simultaneously (elective bands, year-wide level groups,
  parallel core/advanced sections); equal `periods`, a pupil in ≤ 1 option. A lesson is
  never both in a band and a support lesson. The school places bands first, by hand: `Band.fixedSlots`
  is that grid, the solver locks the whole band to it (`solver/patterns.py`). "Εμβ. 3-ωρο" in a subject
  name is its weekly total; its periods are often split into parts living in different bands.
  Not a band: one subject taught to the class and, at the same time, to a single pupil by another
  teacher (Orologio `ΑΤ_…` groups) — that is ΑΣΤ with an excusal (`upgradeV1` converts it); and a
  "support" group naming every pupil of its home groups is the groups' own lesson.
- Orologio's virtual classes/pools are *derived* from these (`src/lib/structure.ts`); the
  Orologio converter emits the old v1 shape internally and calls `upgradeV1`.
- `fixedSlots` (`[{day, periods}]`) locks a lesson's placement (hotel full-day workshops).
- **Rooms**: `Room {name, kind, capacity}`; a lesson has `roomMode` ANY|PREFER|ONLY, optional `roomKind`
  and an ordered `LessonRoom` list. `sameRoom` = every period in one room chosen from the list (hard in
  the room phase; otherwise one room per lesson is only a soft preference). The solver's room phase
  (`solver/rooms.py`) runs after the time phase; `fixedRoom` is legacy text, read only when a lesson has no room list.
- **Block shape** `"2+1+1"` = daily chunks summing to `periods`; stored largest first
  (`src/lib/shape.ts`). Empty shape → all singles.
- Week: Mon 8, Tue 7, Wed 7, Thu 8, Fri 7 periods (`Setting daysPeriods`); `periodExists()` guards period 8.
- Teacher load target = obligation − reduction; `stats.dashboard` compares it with Σ lesson periods.
- Rules are seeded from `src/lib/rulesCatalog.ts` on first read; names/descriptions are messages `ruleCatalog.<code>`.
- Export JSON (`src/lib/exportFormat.ts`) is name-based and is the solver's input format. Lesson keys
  `L0001…` are positional (export order). A timetable JSON is matched to lessons by content — including
  which pupils are excused from each one, since split parts of a subject are otherwise identical — and
  stored as lesson ids, so later edits do not break the viewer.
- Solver attendance rule: a pupil in ΣΤ does not attend the host (or any option of its band), and does
  not attend excused lessons; atoms = pupils with identical attendance. Pupil clashes are hard except for
  provably impossible lists (`impossible_atoms`), which `python -m solver` prints.
