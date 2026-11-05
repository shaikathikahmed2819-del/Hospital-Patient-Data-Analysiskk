// Synthetic, de-identified hospital visit data + aggregate-only analytics.
export type Patient = { patient_id: number; age_band: string; gender_optional: "F" | "M" | null };
export type Department = { department_id: number; department_name: string };
export type Visit = {
  visit_id: number;
  patient_id: number;
  department_id: number;
  visit_date: string; // YYYY-MM-DD
  visit_type: "Outpatient" | "Emergency" | "Follow-up" | "Day-care";
};

export const AGE_BANDS = ["0-17", "18-29", "30-44", "45-59", "60-74", "75+"];
export const VISIT_TYPES: Visit["visit_type"][] = ["Outpatient", "Emergency", "Follow-up", "Day-care"];
export const DEPARTMENTS: Department[] = [
  "General Medicine", "Pediatrics", "Orthopedics", "Cardiology",
  "Obstetrics & Gynecology", "ENT", "Dermatology", "Emergency Care",
].map((department_name, i) => ({ department_id: i + 1, department_name }));

/** Counts below this threshold are suppressed in reports to avoid re-identification. */
export const SUPPRESSION_THRESHOLD = 5;
export function suppress(n: number): string {
  return n > 0 && n < SUPPRESSION_THRESHOLD ? `<${SUPPRESSION_THRESHOLD}` : n.toLocaleString();
}

function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function pick<T>(r: () => number, items: T[], weights: number[]) {
  const total = weights.reduce((a, b) => a + b, 0);
  let x = r() * total;
  for (let i = 0; i < items.length; i++) if ((x -= weights[i]!) < 0) return items[i]!;
  return items[items.length - 1]!;
}

export function generateData(seed = 7) {
  const r = rng(seed);
  const patients: Patient[] = Array.from({ length: 1200 }, (_, i) => ({
    patient_id: i + 1,
    age_band: pick(r, AGE_BANDS, [18, 14, 20, 20, 17, 11]),
    gender_optional: pick(r, ["F", "M", null] as const, [48, 46, 6]),
  }));
  const deptW = [26, 12, 11, 10, 9, 8, 7, 17];
  const visits: Visit[] = [];
  const start = new Date(Date.UTC(2025, 10, 1));
  for (let d = 0; d < 365; d++) {
    const date = new Date(start.getTime() + d * 86400000);
    const dow = date.getUTCDay();
    const month = date.getUTCMonth();
    const seasonal = 1 + 0.25 * Math.cos(((month - 0) / 12) * 2 * Math.PI); // winter peak
    const base = (dow === 0 ? 12 : dow === 6 ? 18 : 28) * seasonal;
    const n = Math.round(base + (r() - 0.5) * 10);
    for (let k = 0; k < n; k++) {
      const p = patients[Math.floor(r() * patients.length)]!;
      const department_id = pick(r, DEPARTMENTS, deptW).department_id;
      visits.push({
        visit_id: visits.length + 1,
        patient_id: p.patient_id,
        department_id: p.age_band === "0-17" && r() < 0.5 ? 2 : department_id,
        visit_date: date.toISOString().slice(0, 10),
        visit_type: department_id === 8 ? "Emergency" : pick(r, VISIT_TYPES, [55, 5, 30, 10]),
      });
    }
  }
  return { patients, departments: DEPARTMENTS, visits };
}

export function stats(values: number[]) {
  const n = values.length;
  if (!n) return { mean: 0, median: 0, std: 0, min: 0, max: 0, p90: 0 };
  const s = [...values].sort((a, b) => a - b);
  const mean = s.reduce((a, b) => a + b, 0) / n;
  const q = (p: number) => {
    const i = (n - 1) * p, lo = Math.floor(i), hi = Math.ceil(i);
    return s[lo]! + (s[hi]! - s[lo]!) * (i - lo);
  };
  const std = Math.sqrt(s.reduce((a, b) => a + (b - mean) ** 2, 0) / n);
  return { mean, median: q(0.5), std, min: s[0]!, max: s[n - 1]!, p90: q(0.9) };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export type Dataset = { patients: Patient[]; departments: Department[]; visits: Visit[] };
export function analyze(data: Dataset, departmentId: number | null) {
  const ageOf = new Map(data.patients.map((p) => [p.patient_id, p.age_band]));
  const v = departmentId ? data.visits.filter((x) => x.department_id === departmentId) : data.visits;

  const daily = new Map<string, number>();
  const monthly = new Map<string, number>();
  const dept = new Map<number, { visits: number; patients: Set<number>; days: Set<string> }>();
  const age = new Map<string, { visits: number; patients: Set<number> }>();
  const type = new Map<string, number>();
  const dow = Array(7).fill(0);

  for (const x of v) {
    daily.set(x.visit_date, (daily.get(x.visit_date) ?? 0) + 1);
    const m = x.visit_date.slice(0, 7);
    monthly.set(m, (monthly.get(m) ?? 0) + 1);
    const d = dept.get(x.department_id) ?? { visits: 0, patients: new Set(), days: new Set() };
    d.visits++; d.patients.add(x.patient_id); d.days.add(x.visit_date);
    dept.set(x.department_id, d);
    const band = ageOf.get(x.patient_id)!;
    const a = age.get(band) ?? { visits: 0, patients: new Set() };
    a.visits++; a.patients.add(x.patient_id); age.set(band, a);
    type.set(x.visit_type, (type.get(x.visit_type) ?? 0) + 1);
    dow[new Date(x.visit_date + "T00:00:00Z").getUTCDay()]!++;
  }

  const total = v.length;
  const dailyCounts = [...daily.values()];
  return {
    total,
    uniquePatients: new Set(v.map((x) => x.patient_id)).size,
    dailyStats: stats(dailyCounts),
    monthly: [...monthly.entries()].sort().map(([k, n]) => ({
      month: `${MONTHS[Number(k.slice(5)) - 1]} ${k.slice(2, 4)}`, visits: n,
    })),
    departments: data.departments.map((d) => {
      const e = dept.get(d.department_id);
      const visits = e?.visits ?? 0;
      return {
        name: d.department_name,
        visits,
        patients: e?.patients.size ?? 0,
        avgPerDay: e ? visits / e.days.size : 0,
        share: total ? visits / total : 0,
      };
    }).filter((d) => d.visits > 0).sort((a, b) => b.visits - a.visits),
    ageBands: AGE_BANDS.map((b) => ({
      band: b, visits: age.get(b)?.visits ?? 0, patients: age.get(b)?.patients.size ?? 0,
    })),
    visitTypes: VISIT_TYPES.map((t) => ({ type: t, visits: type.get(t) ?? 0 })).filter((t) => t.visits),
    weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d, i) => ({ day: d, visits: dow[i]! })),
  };
}

export function toCSV(rows: Record<string, string | number>[]) {
  if (!rows.length) return "";
  const keys = Object.keys(rows[0]!);
  return [keys.join(","), ...rows.map((r) => keys.map((k) => JSON.stringify(r[k])).join(","))].join("\n");
}
