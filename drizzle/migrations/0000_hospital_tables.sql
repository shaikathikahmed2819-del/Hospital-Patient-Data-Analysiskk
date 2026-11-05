CREATE TABLE public.departments (
  department_id serial PRIMARY KEY,
  department_name text NOT NULL UNIQUE
);
CREATE TABLE public.patients (
  patient_id serial PRIMARY KEY,
  age_band text NOT NULL CHECK (age_band IN ('0-17','18-29','30-44','45-59','60-74','75+')),
  gender_optional text CHECK (gender_optional IN ('F','M')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.visits (
  visit_id serial PRIMARY KEY,
  patient_id int NOT NULL REFERENCES public.patients(patient_id),
  department_id int NOT NULL REFERENCES public.departments(department_id),
  visit_date date NOT NULL DEFAULT current_date,
  visit_type text NOT NULL CHECK (visit_type IN ('Outpatient','Emergency','Follow-up','Day-care')),
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX visits_date_idx ON public.visits(visit_date);

GRANT SELECT, INSERT ON public.departments, public.patients, public.visits TO authenticated;
GRANT USAGE ON SEQUENCE public.departments_department_id_seq, public.patients_patient_id_seq, public.visits_visit_id_seq TO authenticated;
GRANT ALL ON public.departments, public.patients, public.visits TO service_role;

ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff read departments" ON public.departments FOR SELECT TO authenticated USING (true);
CREATE POLICY "staff add departments" ON public.departments FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "staff read patients" ON public.patients FOR SELECT TO authenticated USING (true);
CREATE POLICY "staff add patients" ON public.patients FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "staff read visits" ON public.visits FOR SELECT TO authenticated USING (true);
CREATE POLICY "staff add visits" ON public.visits FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());