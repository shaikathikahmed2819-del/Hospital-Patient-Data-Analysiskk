import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/SiteHeader";
import { RequireAuth } from "@/components/RequireAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AGE_BANDS, VISIT_TYPES } from "@/lib/hospital-data";
import { datasetQuery } from "@/lib/hospital-db";

export const Route = createFileRoute("/add")({
  head: () => ({
    meta: [
      { title: "Add data — Ward Ledger" },
      { name: "description", content: "Record de-identified patients, visits and departments." },
      { property: "og:title", content: "Add data — Ward Ledger" },
      { property: "og:description", content: "Record de-identified hospital visit data." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <RequireAuth><AddPage /></RequireAuth>,
});

function Card({ title, note, children }: { title: string; note: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <h2 className="font-display text-lg font-semibold">{title}</h2>
      <p className="mb-4 text-xs text-muted-foreground">{note}</p>
      {children}
    </section>
  );
}

function AddPage() {
  const qc = useQueryClient();
  const { data: depts = [] } = useQuery({
    queryKey: ["departments"],
    queryFn: async () => (await supabase.from("departments").select("*").order("department_id")).data ?? [],
  });
  const refresh = () => { qc.invalidateQueries({ queryKey: datasetQuery.queryKey }); qc.invalidateQueries({ queryKey: ["departments"] }); };

  // patient
  const [age, setAge] = useState("30-44");
  const [gender, setGender] = useState("none");
  async function addPatient(e: React.FormEvent) {
    e.preventDefault();
    const { data, error } = await supabase.from("patients")
      .insert({ age_band: age, gender_optional: gender === "none" ? null : gender }).select("patient_id").single();
    if (error) { toast.error(error.message); return; }
    toast.success(`Patient #${data.patient_id} added`);
    setPatientId(String(data.patient_id));
    refresh();
  }

  // visit
  const [patientId, setPatientId] = useState("");
  const [deptId, setDeptId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [type, setType] = useState<string>("Outpatient");
  async function addVisit(e: React.FormEvent) {
    e.preventDefault();
    if (!deptId) { toast.error("Choose a department"); return; }
    const { error } = await supabase.from("visits").insert({
      patient_id: Number(patientId), department_id: Number(deptId), visit_date: date, visit_type: type,
    });
    if (error) { toast.error(error.message.includes("foreign key") ? "No patient with that number" : error.message); return; }
    toast.success("Visit recorded");
    refresh();
  }

  // department
  const [deptName, setDeptName] = useState("");
  async function addDept(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from("departments").insert({ department_name: deptName.trim() });
    if (error) { toast.error(error.message.includes("duplicate") ? "That department already exists" : error.message); return; }
    toast.success("Department added");
    setDeptName("");
    refresh();
  }

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-5xl space-y-6 px-6 py-8">
        <div>
          <h1 className="font-display text-4xl font-bold">Add data</h1>
          <p className="mt-2 text-muted-foreground">Enter de-identified records only — no names, phone numbers, addresses or diagnoses.</p>
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <Card title="Record a visit" note="Links a visit to an existing patient number">
            <form onSubmit={addVisit} className="space-y-3">
              <div className="space-y-1.5"><Label>Patient number</Label><Input type="number" min={1} required value={patientId} onChange={(e) => setPatientId(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Department</Label>
                <Select value={deptId} onValueChange={setDeptId}>
                  <SelectTrigger><SelectValue placeholder="Choose…" /></SelectTrigger>
                  <SelectContent>{depts.map((d) => <SelectItem key={d.department_id} value={String(d.department_id)}>{d.department_name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Visit date</Label><Input type="date" required value={date} onChange={(e) => setDate(e.target.value)} /></div>
                <div className="space-y-1.5"><Label>Visit type</Label>
                  <Select value={type} onValueChange={setType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{VISIT_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <Button type="submit">Save visit</Button>
            </form>
          </Card>

          <div className="space-y-6">
            <Card title="Add a patient" note="Only an age band and optional gender are stored">
              <form onSubmit={addPatient} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label>Age band</Label>
                    <Select value={age} onValueChange={setAge}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{AGE_BANDS.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5"><Label>Gender (optional)</Label>
                    <Select value={gender} onValueChange={setGender}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Not recorded</SelectItem>
                        <SelectItem value="F">F</SelectItem>
                        <SelectItem value="M">M</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button type="submit" variant="secondary">Add patient</Button>
              </form>
            </Card>

            <Card title="Add a department" note="New departments appear in the dashboard once they have visits">
              <form onSubmit={addDept} className="flex gap-2">
                <Input required maxLength={80} placeholder="e.g. Ophthalmology" value={deptName} onChange={(e) => setDeptName(e.target.value)} />
                <Button type="submit" variant="secondary">Add</Button>
              </form>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
