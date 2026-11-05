import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader } from "@/components/SiteHeader";

export const Route = createFileRoute("/toolkit")({
  head: () => ({
    meta: [
      { title: "SQL & Python Toolkit — Ward Ledger" },
      { name: "description", content: "MySQL schema, access-restricted aggregate views and a Pandas/NumPy/Matplotlib analysis script." },
      { property: "og:title", content: "SQL & Python Toolkit — Ward Ledger" },
      { property: "og:description", content: "MySQL schema and Pandas/Matplotlib scripts for hospital visit analytics." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Toolkit,
});

const SQL = `-- MySQL schema: synthetic / de-identified data only
CREATE TABLE departments (
  department_id   INT PRIMARY KEY AUTO_INCREMENT,
  department_name VARCHAR(80) NOT NULL UNIQUE
);

CREATE TABLE patients (
  patient_id      INT PRIMARY KEY AUTO_INCREMENT,   -- surrogate key, no names/IDs
  age_band        ENUM('0-17','18-29','30-44','45-59','60-74','75+') NOT NULL,
  gender_optional ENUM('F','M') NULL
);

CREATE TABLE visits (
  visit_id      INT PRIMARY KEY AUTO_INCREMENT,
  patient_id    INT NOT NULL,
  department_id INT NOT NULL,
  visit_date    DATE NOT NULL,
  visit_type    ENUM('Outpatient','Emergency','Follow-up','Day-care') NOT NULL,
  FOREIGN KEY (patient_id) REFERENCES patients(patient_id),
  FOREIGN KEY (department_id) REFERENCES departments(department_id),
  INDEX idx_visit_date (visit_date),
  INDEX idx_dept_date (department_id, visit_date)
);

-- Aggregate-only views (counts < 5 suppressed)
CREATE VIEW v_department_workload AS
SELECT d.department_name,
       IF(COUNT(*) < 5, NULL, COUNT(*))                       AS visits,
       IF(COUNT(DISTINCT v.patient_id) < 5, NULL,
          COUNT(DISTINCT v.patient_id))                       AS distinct_patients,
       ROUND(COUNT(*) / COUNT(DISTINCT v.visit_date), 2)      AS avg_per_active_day
FROM visits v JOIN departments d USING (department_id)
GROUP BY d.department_name;

CREATE VIEW v_monthly_visits AS
SELECT DATE_FORMAT(visit_date, '%Y-%m') AS month, COUNT(*) AS visits
FROM visits GROUP BY month;

CREATE VIEW v_age_band_summary AS
SELECT p.age_band,
       IF(COUNT(*) < 5, NULL, COUNT(*)) AS visits,
       IF(COUNT(DISTINCT p.patient_id) < 5, NULL, COUNT(DISTINCT p.patient_id)) AS patients
FROM visits v JOIN patients p USING (patient_id)
GROUP BY p.age_band;

-- Restrict access: analysts see views only, never raw rows
CREATE ROLE 'analyst';
GRANT SELECT ON hospital.v_department_workload TO 'analyst';
GRANT SELECT ON hospital.v_monthly_visits      TO 'analyst';
GRANT SELECT ON hospital.v_age_band_summary    TO 'analyst';
CREATE USER 'report_user'@'%' IDENTIFIED BY 'change-me';
GRANT 'analyst' TO 'report_user'@'%';
SET DEFAULT ROLE 'analyst' TO 'report_user'@'%';`;

const PY = `"""Hospital visit analysis — operational statistics only, not clinical advice."""
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from sqlalchemy import create_engine

engine = create_engine("mysql+pymysql://report_user:change-me@localhost/hospital")
NOTE = "Operational statistics · synthetic data · not clinical advice"

# Query raw tables only with a privileged role; analysts use the views.
visits = pd.read_sql("""
    SELECT v.visit_date, v.visit_type, d.department_name, p.age_band, v.patient_id
    FROM visits v JOIN departments d USING (department_id)
                  JOIN patients p USING (patient_id)""", engine, parse_dates=["visit_date"])

def suppress(s: pd.Series) -> pd.Series:
    return s.where(s >= 5)          # NaN where count < 5

# Daily / monthly summaries
daily = visits.groupby("visit_date").size()
monthly = visits.groupby(visits.visit_date.dt.to_period("M")).size()
print("Daily visits —", {k: round(float(f(daily)), 2) for k, f in
      {"mean": np.mean, "median": np.median, "std": np.std,
       "p90": lambda x: np.percentile(x, 90), "max": np.max}.items()})

# Department workload
dept = (visits.groupby("department_name")
        .agg(visits=("patient_id", "size"),
             distinct_patients=("patient_id", "nunique"),
             active_days=("visit_date", "nunique")))
dept["avg_per_day"] = (dept.visits / dept.active_days).round(2)
dept["share_pct"] = (100 * dept.visits / dept.visits.sum()).round(1)
dept[["visits", "distinct_patients"]] = dept[["visits", "distinct_patients"]].apply(suppress)
dept.sort_values("visits", ascending=False).to_csv("department_workload.csv")

# Age-band summary (aggregate only)
age = visits.groupby("age_band").agg(visits=("patient_id", "size"),
                                     patients=("patient_id", "nunique")).apply(suppress)
age.to_csv("age_band_summary.csv")

# Charts
fig, ax = plt.subplots(1, 3, figsize=(17, 5))
dept.visits.sort_values().plot.barh(ax=ax[0], color="#2f7a7a", title="Department workload")
monthly.plot(ax=ax[1], marker="o", color="#2f7a7a", title="Monthly visits")
age.visits.plot.bar(ax=ax[2], color="#e0913a", title="Visits by age band")
fig.suptitle(NOTE, fontsize=9, color="gray")
fig.tight_layout()
fig.savefig("visit_report.png", dpi=150)`;

function Code({ title, code }: { title: string; code: string }) {
  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <h2 className="font-display text-lg font-semibold">{title}</h2>
        <button className="text-xs font-medium text-primary hover:underline" onClick={() => navigator.clipboard.writeText(code)}>Copy</button>
      </div>
      <pre className="overflow-x-auto p-5 font-mono text-xs leading-relaxed text-foreground"><code>{code}</code></pre>
    </section>
  );
}

function Toolkit() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-5xl space-y-6 px-6 py-8">
        <div>
          <h1 className="font-display text-4xl font-bold">SQL & Python toolkit</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Run the same analysis on your own MySQL database. Analysts get access to summary views only — raw visit rows stay locked.
          </p>
        </div>
        <Code title="MySQL schema, views & access roles" code={SQL} />
        <Code title="Pandas · NumPy · Matplotlib analysis" code={PY} />
      </main>
    </div>
  );
}
