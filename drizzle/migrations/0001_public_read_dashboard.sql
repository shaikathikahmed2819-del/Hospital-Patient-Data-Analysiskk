GRANT SELECT ON public.departments TO anon;
GRANT SELECT ON public.patients TO anon;
GRANT SELECT (visit_id, patient_id, department_id, visit_date, visit_type) ON public.visits TO anon;
CREATE POLICY "public read departments" ON public.departments FOR SELECT TO anon USING (true);
CREATE POLICY "public read patients" ON public.patients FOR SELECT TO anon USING (true);
CREATE POLICY "public read visits" ON public.visits FOR SELECT TO anon USING (true);