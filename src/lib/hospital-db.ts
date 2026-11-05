import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Dataset, Department, Patient, Visit } from "./hospital-data";

async function fetchAll<T>(table: "patients" | "departments" | "visits", cols: string): Promise<T[]> {
  const out: T[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await supabase.from(table).select(cols).range(from, from + page - 1);
    if (error) throw error;
    out.push(...(data as unknown as T[]));
    if (!data || data.length < page) return out;
  }
}

export const datasetQuery = queryOptions({
  queryKey: ["hospital-dataset"],
  queryFn: async (): Promise<Dataset> => {
    const [patients, departments, visits] = await Promise.all([
      fetchAll<Patient>("patients", "patient_id, age_band, gender_optional"),
      fetchAll<Department>("departments", "department_id, department_name"),
      fetchAll<Visit>("visits", "visit_id, patient_id, department_id, visit_date, visit_type"),
    ]);
    departments.sort((a, b) => a.department_id - b.department_id);
    return { patients, departments, visits };
  },
});
