// Orologio project folder → the app's JSON export.
//
//   npm run orologio:json -- "26-27 (1)" data/orologio-26-27.json ["School name"]
//
// Reads the .DAT, .REL and (if present) .RES in the folder (windows-1253), converts
// them (src/lib/orologio) and validates the result against the import schema. The
// .RES is needed for pools: it is the only place Orologio records which lessons
// run together. Import the result with:  npm run import:json -- data/orologio-26-27.json --replace

import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { convertOrologio } from "@/lib/orologio/convert";
import { ExportV2Schema, danglingReferences } from "@/lib/exportFormat";

const [folderArg, outArg, schoolName = ""] = process.argv.slice(2);
if (!folderArg || !outArg) {
  console.error('usage: npm run orologio:json -- <orologio folder> <out.json> ["school name"]');
  process.exit(2);
}
const folder = resolve(process.cwd(), folderArg);
const out = resolve(process.cwd(), outArg);

const decoder = new TextDecoder("windows-1253");
const read = (ext: string): string | undefined => {
  const name = readdirSync(folder).find((f) => f.toUpperCase().endsWith(`.${ext}`));
  return name ? decoder.decode(readFileSync(join(folder, name))) : undefined;
};

const dat = read("DAT");
const rel = read("REL");
if (!dat || !rel) {
  console.error(`no .DAT/.REL found in ${folder}`);
  process.exit(1);
}
const res = read("RES");
if (!res || res.trim().split(/\r?\n/).length < 3) console.warn("warning: no filled .RES — lessons will have no pools");

const { file, report } = convertOrologio({ dat, rel, res }, schoolName);
const parsed = ExportV2Schema.parse(file);
const problems = danglingReferences(parsed);

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(parsed, null, 1));

console.log(`${out}`);
const { structure, ...counts } = report;
console.table(counts);
console.table({ ...structure, notes: structure.notes.length });
for (const n of structure.notes.slice(0, 30)) console.log("  note:", n);
if (problems.length) {
  console.error(`${problems.length} dangling references (import would refuse):`);
  for (const p of problems.slice(0, 20)) console.error("  " + p);
  process.exit(1);
}
