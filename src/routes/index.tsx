import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, PieChart, Pie, Cell,
} from "recharts";
import { Download } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { analyze, suppress, toCSV, type Dataset } from "@/lib/hospital-data";
import { useQuery } from "@tanstack/react-query";
import { AskPanel } from "@/components/AskPanel";
import { datasetQuery } from "@/lib/hospital-db";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — Ward Ledger Hospital Visit Analytics" },
      { name: "description", content: "Department workload, monthly visit trends and age-band summaries from synthetic hospital data." },
      { property: "og:title", content: "Ward Ledger — Hospital Visit Analytics" },
      { property: "og:description", content: "Aggregate operational statistics on synthetic hospital visits." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DashboardLoader,
});

const C = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];
const tip = { contentStyle: { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12 } };

function download(name: string, csv: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv + "\n\n# Operational statistics from synthetic data. Not clinical advice."], { type: "text/csv" }));
  a.download = name;
  a.click();
}

function Panel({ title, note, children, action }: { title: string; note?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-lg font-semibold">{title}</h2>
          {note && <p className="text-xs text-muted-foreground">{note}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function DashboardLoader() {
  const q = useQuery(datasetQuery);
  if (q.error) return <div className="p-10 text-center text-sm text-destructive">Couldn't load data.</div>;
  if (!q.data) return <div className="min-h-screen bg-background"><SiteHeader /><p className="p-10 text-center text-sm text-muted-foreground">Loading records…</p></div>;
  return <Dashboard data={q.data} />;
}

function Dashboard({ data }: { data: Dataset }) {
  const [dept, setDept] = useState("all");
  const a = useMemo(() => analyze(data, dept === "all" ? null : Number(dept)), [dept, data]);
  const s = a.dailyStats;

  const kpis = [
    ["Total visits", suppress(a.total)],
    ["Distinct patients", suppress(a.uniquePatients)],
    ["Mean visits / day", s.mean.toFixed(1)],
    ["Median / day", s.median.toFixed(1)],
    ["Std. deviation", s.std.toFixed(1)],
    ["90th pct / day", s.p90.toFixed(1)],
  ];

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-7xl space-y-6 px-6 py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-xs uppercase tracking-widest text-accent-foreground">Live records · {a.total.toLocaleString()} visits</p>
            <h1 className="font-display text-4xl font-bold">Patient visit overview</h1>
          </div>
          <Select value={dept} onValueChange={setDept}>
            <SelectTrigger className="w-64 bg-card"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All departments</SelectItem>
              {data.departments.map((d) => <SelectItem key={d.department_id} value={String(d.department_id)}>{d.department_name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
          {kpis.map(([k, v]) => (
            <div key={k} className="rounded-lg border border-border bg-card p-4">
              <div className="text-xs text-muted-foreground">{k}</div>
              <div className="mt-1 font-mono text-2xl font-medium text-primary">{v}</div>
            </div>
          ))}
        </div>

        <AskPanel />

        <Panel title="Monthly visit trend" note="Total visits per calendar month">
          <div className="h-64">
            <ResponsiveContainer>
              <LineChart data={a.monthly}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="month" fontSize={12} stroke="var(--muted-foreground)" />
                <YAxis fontSize={12} stroke="var(--muted-foreground)" />
                <Tooltip {...tip} />
                <Line dataKey="visits" stroke="var(--chart-1)" strokeWidth={2.5} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <div className="grid gap-6 lg:grid-cols-2">
          <Panel title="Department workload" note="Visits by department"
            action={<Button size="sm" variant="outline" onClick={() => download("department_workload.csv", toCSV(a.departments.map((d) => ({ department: d.name, visits: suppress(d.visits), distinct_patients: suppress(d.patients), avg_per_active_day: d.avgPerDay.toFixed(2), share_pct: (d.share * 100).toFixed(1) }))))}><Download className="size-4" />CSV</Button>}>
            <div className="h-72">
              <ResponsiveContainer>
                <BarChart data={a.departments} layout="vertical" margin={{ left: 40 }}>
                  <CartesianGrid stroke="var(--border)" horizontal={false} />
                  <XAxis type="number" fontSize={12} stroke="var(--muted-foreground)" />
                  <YAxis type="category" dataKey="name" width={130} fontSize={11} stroke="var(--muted-foreground)" />
                  <Tooltip {...tip} />
                  <Bar dataKey="visits" fill="var(--chart-1)" radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          <Panel title="Age-band summary" note="Aggregated by age band only — no individual ages stored"
            action={<Button size="sm" variant="outline" onClick={() => download("age_band_summary.csv", toCSV(a.ageBands.map((b) => ({ age_band: b.band, visits: suppress(b.visits), distinct_patients: suppress(b.patients) }))))}><Download className="size-4" />CSV</Button>}>
            <div className="h-72">
              <ResponsiveContainer>
                <BarChart data={a.ageBands}>
                  <CartesianGrid stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="band" fontSize={12} stroke="var(--muted-foreground)" />
                  <YAxis fontSize={12} stroke="var(--muted-foreground)" />
                  <Tooltip {...tip} />
                  <Bar dataKey="visits" fill="var(--chart-2)" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="patients" fill="var(--chart-3)" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          <Panel title="Visits by weekday" note="Weekly load pattern">
            <div className="h-60">
              <ResponsiveContainer>
                <BarChart data={a.weekday}>
                  <CartesianGrid stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="day" fontSize={12} stroke="var(--muted-foreground)" />
                  <YAxis fontSize={12} stroke="var(--muted-foreground)" />
                  <Tooltip {...tip} />
                  <Bar dataKey="visits" fill="var(--chart-4)" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          <Panel title="Visit type mix">
            <div className="flex h-60 items-center">
              <ResponsiveContainer width="55%">
                <PieChart>
                  <Pie data={a.visitTypes} dataKey="visits" nameKey="type" innerRadius={50} outerRadius={85}>
                    {a.visitTypes.map((_, i) => <Cell key={i} fill={C[i]} />)}
                  </Pie>
                  <Tooltip {...tip} />
                </PieChart>
              </ResponsiveContainer>
              <ul className="space-y-2 text-sm">
                {a.visitTypes.map((t, i) => (
                  <li key={t.type} className="flex items-center gap-2">
                    <span className="size-3 rounded-sm" style={{ background: C[i] }} />
                    {t.type} <span className="font-mono text-muted-foreground">{((t.visits / a.total) * 100).toFixed(1)}%</span>
                  </li>
                ))}
              </ul>
            </div>
          </Panel>
        </div>

        <Panel title="Department workload report" note="Average per day is computed over days the department had at least one visit">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="py-2">Department</th><th className="text-right">Visits</th><th className="text-right">Distinct patients</th><th className="text-right">Avg / day</th><th className="text-right">Share</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {a.departments.map((d) => (
                  <tr key={d.name} className="border-b border-border/60">
                    <td className="py-2 font-sans">{d.name}</td>
                    <td className="text-right">{suppress(d.visits)}</td>
                    <td className="text-right">{suppress(d.patients)}</td>
                    <td className="text-right">{d.avgPerDay.toFixed(1)}</td>
                    <td className="text-right">{(d.share * 100).toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <p className="pb-6 text-center text-xs text-muted-foreground">
          All figures are operational statistics computed from synthetic data for educational use. They are not diagnoses, clinical findings or treatment recommendations. Individual records are never displayed.
        </p>
      </main>
    </div>
  );
}
