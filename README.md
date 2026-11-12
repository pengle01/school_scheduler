# School Scheduler — data entry

Web app for entering everything the timetable solver needs: teachers and their teaching
load, subjects, groups (home groups, merged groups, electives, support), students and their
group membership, **pools** (sets of lessons that always run at the same periods), lessons
(subject × group × teacher × periods × block shape), teacher unavailability and the
hard/soft rule catalogue. Greek-first UI with English.

Same architecture as the SMS project (`../sms`): Next.js 16 App Router · React 19 ·
Prisma 7 + PostgreSQL · tRPC 11 · next-intl · shadcn/ui + Tailwind 4 · Vitest.
No login yet — it runs on `localhost` for one user.

## Setup

### One-command install

Fresh machine → running app (Node 20, PostgreSQL, role + database, `.env`, dependencies,
schema, production build). Both scripts are idempotent: run them again to update.

```bash
# Ubuntu / Debian / WSL
bash scripts/install.sh                      # asks once for a password for the DB role
DB_PASSWORD=secret bash scripts/install.sh   # non-interactive
```

```powershell
# Windows 10/11 (PowerShell; uses winget for Node and PostgreSQL)
powershell -ExecutionPolicy Bypass -File scripts\install.ps1
```

Defaults: role `scheduler`, database `scheduler`; override with `DB_USER`/`DB_NAME`
(`-DbUser`/`-DbName` on Windows). On Windows the script also asks for the `postgres`
superuser password set during the PostgreSQL install.

Then `npm start` → <http://localhost:3000> (production) or `npm run dev` (development).

### Manual setup

Requirements: Node 20+, PostgreSQL 15+ (local server).

```bash
npm install
createdb -h localhost -U <user> scheduler          # once
cp .env.example .env                              # DATABASE_URL="postgresql://<user>:<password>@localhost:5432/scheduler"
npm run db:push        # create the tables (no migration files — db push)
npm run db:generate    # Prisma client → src/generated/prisma
npm run dev
```

After every change to `prisma/schema.prisma`: `npm run db:push && npm run db:generate && rm -rf .next`.

## Scripts

| command | what |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run lint` · `npm run test` | ESLint · Vitest unit tests (`src/test/unit`) |
| `npm run db:push` · `db:generate` · `db:studio` | Prisma |
| `npm run orologio:json -- "<folder>" data/x.json ["school"]` | convert an Orologio project (`.DAT` + `.REL` + `.RES`) to the app's JSON — teachers with obligations, subjects, groups, students and memberships, pools, lessons, unavailability |
| `npm run import:json -- data/x.json --replace\|--merge [--dry-run]` | import a JSON into the database from the terminal (same code as the Import page) |

## Pages (`/el/admin/…`)

`dashboard` load per teacher and warnings · `teachers` (+ `teachers/<id>`: availability grid,
lessons, overrides) · `subjects` · `home-groups` (+ `home-groups/<id>`: the τμήμα page —
pupils, plain lessons, merged lessons, each host lesson with the support lessons running
during it and a coverage check, band options) · `students` · `lessons` (whole school, one
row per κατανομή line, structure column) · `bands` (+ `bands/<id>`: options and checks) ·
`rooms` (name, type, capacity) · `rules` · `settings` · `data` (JSON export / import; v1 files are upgraded on import).
A lesson's room is set in its form: any room / any room of a type / a preferred list in order / only these rooms.

The export JSON (`src/lib/exportFormat.ts`) is name-based and is the solver's input format.

## Loading the school's current data

```bash
npm run orologio:json -- "26-27 (1)" data/orologio-26-27.json "Όνομα σχολείου"
npm run import:json -- data/orologio-26-27.json --replace
```

`data/*.json` is git-ignored (it carries teacher names and student register numbers).
Orologio only records which lessons run together in the result file, so a project saved
*after* generating the timetable is needed for the pools; without a `.RES` the lessons import
with no pool.

## Solver (Python, OR-Tools CP-SAT)

```bash
python3 -m venv .venv && .venv/bin/pip install -r solver/requirements.txt   # once (the installers do it)
.venv/bin/python -m solver check  data/orologio-26-27.json                   # data problems only
.venv/bin/python -m solver solve  data/orologio-26-27.json --time 600        # → data/timetable-26-27.json + .xlsx
.venv/bin/python -m solver verify data/orologio-26-27.json data/timetable-26-27.json
.venv/bin/python -m pytest solver/tests
```

Input is the app's export JSON (v2). The placement-pattern model (`solver/patterns.py`,
`solver/model.py`): each block of a lesson picks one placement; hard rules — one lesson per
teacher per slot, blocks on different days, band options simultaneous, support inside its
host, locks, unavailability, T3/T4; soft — T2 runs, gaps, "prefer free" slots and, by
default, pupil clashes (`--pupils hard` makes them hard; with the Orologio lists as they
are, hard is unsatisfiable because most pupils have exactly 37 periods and the lists overlap).
`solver/verify.py` re-checks a timetable independently of the model. Output: JSON with the
placements and an xlsx with one grid per teacher, per home group and per room, a summary
and the violations.

**Zone grid**: zones (ζώνες) are placed first, by hand — the Πλέγμα ζωνών page gives every zone its
periods and checks the grid (a teacher or pupils in two zones at one slot, wrong period counts). The
solver treats the grid as locks and builds the rest around it. `npm run zone-grid -- <export.json>`
loads a grid from a file; the Orologio conversion carries this year's grid.

**Across days**: a lesson marked "Αλλαγή ημέρας" has one block that runs across two days. Its shape
gives the split in written order: `3+4` = the last 3 periods of a day, then periods 1–4 of the next
(Mon→Tue … Thu→Fri); `2+1+1` = last 2, then period 1, plus one more single elsewhere. **Ignoring the zone grid**: add
`--ignore-grid` to `python -m solver solve` (and to `verify`) to let the solver place the zones.

**Support**: ΣΤ always runs during French, one period of Greek and one of Maths. ΑΣΤ and ΕΞΣΤ have no
host lesson: on the Στήριξη page each pupil is excused from the lessons the ministry names, and with a
full week the solver can only place the support lesson in a freed period. `--hint` matches a previous
timetable to the lessons by content, so it survives a new export.

**Browse a result in the app**: `npm run import:timetable -- data/timetable-26-27.json` (or the
"Load result" button on the Πρόγραμμα page) attaches the solver's JSON to the database; the page
shows the week per teacher, pupil, home group or room, and a click on a period opens the lesson
with its band options, its host or its support lessons at that moment. Import right after
solving: the file's lesson keys follow the export order, so they drift when lessons change.

**Rule O1 — lesson order**: a lesson's "Comes after" list (lesson form; `LessonOrder` rows, `after`
keys in the export) names lessons of the same teacher it follows, e.g. Physics ΘΗΨ2α+ΘΗΨ2β after
ΘΗΨ2α and after ΘΗΨ2β. Its k-th period in the week comes after the k-th period of each of them
(α, β, joint, α, β, joint, joint); periods left over go anywhere after. Loops are refused. Hard by
default, can be made soft or switched off per teacher. Lessons with links show ↻ in Διδασκαλίες.

**Rooms with the times** (`solver/joint.py`, default; `--rooms after` turns it off): each lesson
chooses its room for the week inside the time model, among its first 6 listed rooms or a pool of
its other candidates (checked by counting: lessons confined to a set of rooms never outnumber
them). So the times always leave a room for every "only these" lesson, and stage 2 weighs room
preferences and R4 against the teachers' days. The model grows from about 104k variables / 76k
constraints to 171k / 144k on the 2026-27 data; expect roughly 1.5–2× the memory of `--rooms after`.

**Room phase** (`solver/rooms.py`) runs after the times are fixed, starting from the joint choice (also on its own:
`python -m solver rooms <data.json> <timetable.json>`): one lesson per room per period;
"only these rooms" and room types are hard, preferences (in order), one room per lesson,
few room changes per teacher per day (R3) and few different rooms per teacher in the week (R4) are soft; capacity shortfalls are reported. A lesson
marked "same room for every period" (set per lesson, or for a whole filtered category on the
Διδασκαλίες page) takes one room from its list for all its periods — hard.
Cross-day blocks are not handled yet.

## Related notes

`OROLOGIO-FORMAT.md` — the current software's
file format, decoded. Real school data stays local and is never committed.
