import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { RequireAuth } from "@/components/RequireAuth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { datasetQuery } from "@/lib/hospital-db";

export const Route = createFileRoute("/records")({
  head: () => ({
    meta: [
      { title: "Patient records — Ward Ledger" },
      { name: "description", content: "Staff view of de-identified patient records and visit history." },
      { property: "og:title", content: "Patient records — Ward Ledger" },
      { property: "og:description", content: "Restricted staff view of de-identified patient records." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <RequireAuth><RecordsPage /></RequireAuth>,
});

const PAGE = 25;

function RecordsPage() {
  const q = useQuery(datasetQuery);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  const rows = useMemo(() => {
    if (!q.data) return [];
    const visitsByPatient = new Map<number, { count: number; last: string }>();
    for (const v of q.data.visits) {
      const cur = visitsByPatient.get(v.patient_id);
      if (!cur) visitsByPatient.set(v.patient_id, { count: 1, last: v.visit_date });
      else { cur.count += 1; if (v.visit_date > cur.last) cur.last = v.visit_date; }
    }
    return q.data.patients
      .map((p) => ({
        ...p,
        visits: visitsByPatient.get(p.patient_id)?.count ?? 0,
        lastVisit: visitsByPatient.get(p.patient_id)?.last ?? "—",
      }))
      .sort((a, b) => b.patient_id - a.patient_id);
  }, [q.data]);

  const filtered = useMemo(() => {
    const s = search.trim();
    if (!s) return rows;
    return rows.filter((r) => String(r.patient_id).includes(s));
  }, [rows, search]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const shown = filtered.slice(page * PAGE, (page + 1) * PAGE);

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-5xl space-y-6 px-6 py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-4xl font-bold">Patient records</h1>
            <p className="mt-2 text-muted-foreground">
              De-identified records only — patient number, age band and optional gender. Staff access only.
            </p>
          </div>
          <Input
            className="w-64 bg-card"
            placeholder="Search patient number…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          />
        </div>

        {q.error ? (
          <p className="text-sm text-destructive">Couldn't load records.</p>
        ) : !q.data ? (
          <p className="text-sm text-muted-foreground">Loading records…</p>
        ) : (
          <section className="rounded-lg border border-border bg-card p-5">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="py-2">Patient #</th>
                    <th>Age band</th>
                    <th>Gender</th>
                    <th className="text-right">Visits</th>
                    <th className="text-right">Last visit</th>
                  </tr>
                </thead>
                <tbody className="font-mono">
                  {shown.map((r) => (
                    <tr key={r.patient_id} className="border-b border-border/60">
                      <td className="py-2">{r.patient_id}</td>
                      <td>{r.age_band}</td>
                      <td>{r.gender_optional ?? "—"}</td>
                      <td className="text-right">{r.visits}</td>
                      <td className="text-right">{r.lastVisit}</td>
                    </tr>
                  ))}
                  {shown.length === 0 && (
                    <tr><td colSpan={5} className="py-6 text-center font-sans text-muted-foreground">No matching records.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
              <span>{filtered.length.toLocaleString()} record{filtered.length === 1 ? "" : "s"} · page {page + 1} of {pages}</span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</Button>
                <Button size="sm" variant="outline" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>Next</Button>
              </div>
            </div>
          </section>
        )}

        <p className="pb-6 text-center text-xs text-muted-foreground">
          Records are synthetic and de-identified. Operational statistics only — not clinical advice.
        </p>
      </main>
    </div>
  );
}
