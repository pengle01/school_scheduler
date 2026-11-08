// Low-level readers for Orologio's export files (see OROLOGIO-FORMAT.md).
// Input is the file text already decoded from windows-1253; output is plain records.

export type Records = Map<number, string[][]>;

// `.DAT` / `.REL`: lines "<type>#f0#f1#…#" → fields per type. Header "Key=Value" lines are skipped.
export function parseRecords(text: string): Records {
  const out: Records = new Map();
  for (const raw of text.split(/\r?\n/)) {
    const m = /^ *(\d+)#(.*)$/.exec(raw);
    if (!m) continue;
    const type = Number(m[1]);
    const fields = m[2].split("#");
    if (fields.length && fields[fields.length - 1] === "") fields.pop();
    if (!out.has(type)) out.set(type, []);
    out.get(type)!.push(fields);
  }
  return out;
}

export interface ResRow {
  day: number;
  period: number;
  teacher: number; // 1-based row in type 2
  cls: number; // 1-based row in type 3 (≤ real classes → real class, else pool)
  slot: number; // home-group index within the class, or sub-slot within the pool
  room: number; // 1-based row in type 4
  subject: number; // 1-based row in 13015
  flag: string;
}

// `.RES`: fixed-width rows of 26 characters.
export function parseRes(text: string): ResRow[] {
  const rows: ResRow[] = [];
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim() || raw.startsWith("File=") || raw.startsWith("Version=")) continue;
    const widths = [3, 3, 4, 4, 4, 3, 3, 2];
    const f: number[] = [];
    let pos = 0;
    for (const w of widths) {
      f.push(Number(raw.slice(pos, pos + w).trim()));
      pos += w;
    }
    rows.push({ day: f[0], period: f[1], teacher: f[2], cls: f[3], slot: f[4], room: f[5], subject: f[6], flag: raw.slice(24, 26).trim() });
  }
  return rows;
}

// Orologio stores a lesson's block shape as five numbers, e.g. "2  2  1  1  1": the
// chunks are the prefix that sums to the hours. No fitting prefix → all singles.
export function patternToShape(pattern: string, hours: number): string {
  const parts = pattern.trim().split(/\s+/).map(Number);
  const chunks: number[] = [];
  let sum = 0;
  for (const p of parts) {
    if (sum >= hours) break;
    chunks.push(p);
    sum += p;
  }
  if (sum !== hours || chunks.some((c) => !Number.isInteger(c) || c < 1)) return Array.from({ length: hours }, () => 1).join("+");
  return chunks.sort((a, b) => b - a).join("+");
}

// "Μαθηματικά (ΑΠ)" → A, "Φυσική (Β)" → B, "Υγιεινή" → NONE
export function subjectLevel(name: string): "A" | "B" | "C" | "NONE" {
  const m = /\(([ΑΒΓ])[ΘΠ]?\)\s*$/.exec(name.trim());
  if (!m) return "NONE";
  return m[1] === "Α" ? "A" : m[1] === "Β" ? "B" : "C";
}

export type GroupKind = "HOME" | "MERGED" | "ELECTIVE" | "SUPPORT" | "PULLOUT";

// The school's naming conventions; `isHome` comes from the file (external id present).
export function groupKind(name: string, isHome: boolean): GroupKind {
  if (isHome) return "HOME";
  if (/^(ΣΤ|ΕΞΣΤ)_/.test(name)) return "SUPPORT";
  if (/^ΑΣΤ_/.test(name)) return "PULLOUT";
  if (/^[ΑΒΓ][ΠΘΞ]\d/.test(name) || /^[ΑΒΓ]Ξ/.test(name)) return "ELECTIVE";
  if (name.includes("_") || name.includes("+")) return "MERGED";
  return "ELECTIVE";
}

export function groupYear(name: string): "A" | "B" | "C" | "NONE" {
  const m = /[1-3]/.exec(name);
  return m ? (["A", "B", "C"][Number(m[0]) - 1] as "A" | "B" | "C") : "NONE";
}

export function groupDirection(name: string): "THEORY" | "PRACTICE" | "HOTEL" | "SPECIAL" | "NONE" {
  if (name.startsWith("ΞΕ")) return "HOTEL";
  if (name.startsWith("ΕΜ")) return "SPECIAL";
  if (name.startsWith("Θ")) return "THEORY";
  if (/^[Α-Ω]{2}\d/.test(name)) return "PRACTICE";
  return "NONE";
}

// Groups such as "ΓΞ1Γ-" were a 2025-26 workaround (one lesson split in two); the real group is "ΓΞ1Γ".
export function canonicalGroupName(name: string): string {
  return name.trim().replace(/-$/, "");
}

export const DEPARTMENT_BY_CODE: Record<string, string> = {
  "32000": "Α", "40600": "Β", "32100": "Γ", "41700": "Δ", "41900": "Δ", "31100": "Ε", "42600": "ΕΓ", "42700": "ΕΔ",
  "43200": "ΕΕ", "43100": "ΕΚ", "42900": "ΕΠ", "43000": "ΕΠ", "41100": "ΗΛ", "40500": "ΗΥ", "31000": "Θ", "31200": "Μ",
  "42200": "Ξ", "42300": "Ξ", "42400": "Ξ", "32600": "Ρ", "32850": "Σ", "33500": "ΣΕΑ", "40000": "Τ", "31300": "Φ",
  "31500": "Χ", "32900": "Ω",
};

export function departmentOf(name: string, code: string): string | null {
  const prefix = name.split("-")[0];
  if (prefix && prefix !== name && prefix.length <= 3) return prefix;
  return DEPARTMENT_BY_CODE[code] ?? null;
}
