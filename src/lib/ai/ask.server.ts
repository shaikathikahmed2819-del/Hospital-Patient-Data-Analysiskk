import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { analyze, suppress, type Dataset } from "@/lib/hospital-data";
import { createLovableAiGatewayRunIdFetch, getLovableAiGatewayRunId, withLovableAiGatewayRunIdHeader } from "./run-id.server";

const MODEL = "openai/gpt-6-astra";

async function loadDataset(): Promise<Dataset> {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  const sb = createClient<Database>(process.env["SUPABASE_URL"]!, key, {
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
  async function all(table: "patients" | "departments" | "visits", cols: string) {
    const out: unknown[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb.from(table).select(cols).range(from, from + 999);
      if (error) throw error;
      out.push(...(data ?? []));
      if (!data || data.length < 1000) return out;
    }
  }
  const [patients, departments, visits] = await Promise.all([
    all("patients", "patient_id, age_band, gender_optional"),
    all("departments", "department_id, department_name"),
    all("visits", "visit_id, patient_id, department_id, visit_date, visit_type"),
  ]);
  return { patients, departments, visits } as Dataset;
}

/** Aggregate-only summary; no row-level data ever reaches the model. */
export function buildSummary(data: Dataset) {
  const all = analyze(data, null);
  const byDeptMonth: Record<string, Record<string, string>> = {};
  for (const d of data.departments) {
    const a = analyze(data, d.department_id);
    if (!a.total) continue;
    byDeptMonth[d.department_name] = Object.fromEntries(a.monthly.map((m) => [m.month, suppress(m.visits)]));
  }
  const dates = data.visits.map((v) => v.visit_date).sort();
  return {
    date_range: dates.length ? `${dates[0]} to ${dates[dates.length - 1]}` : "no visits recorded",
    total_visits: suppress(all.total),
    daily_visit_stats: Object.fromEntries(Object.entries(all.dailyStats).map(([k, v]) => [k, Number(v.toFixed(2))])),
    monthly_totals: Object.fromEntries(all.monthly.map((m) => [m.month, suppress(m.visits)])),
    departments: all.departments.map((d) => ({ name: d.name, visits: suppress(d.visits), ...(d.visits >= 5 ? { share_pct: +(d.share * 100).toFixed(1), avg_per_active_day: +d.avgPerDay.toFixed(1) } : {}) })),
    department_monthly: byDeptMonth,
    weekday_totals: Object.fromEntries(all.weekday.map((w) => [w.day, suppress(w.visits)])),
    visit_types: Object.fromEntries(all.visitTypes.map((t) => [t.type, suppress(t.visits)])),
    age_bands: Object.fromEntries(all.ageBands.map((b) => [b.band, suppress(b.visits)])),
  };
}

const INSTRUCTIONS = `You explain hospital OPERATIONAL statistics to the public.
Rules:
- Use ONLY the aggregate JSON provided. Never invent numbers. If the data can't answer, say so.
- Explain trends by department and date (months, weekdays) in plain language, citing figures.
- Values like "<5" are suppressed small counts; treat them as fewer than five, never guess exact values.
- Never discuss individual patients, never attempt re-identification.
- Never give diagnoses, medical or treatment advice; decline such questions politely.
- Plain text only, no markdown symbols. Keep answers under 200 words. End with: "Operational statistics only — not clinical advice."`;

export async function handleAsk(request: Request) {
  let question = "";
  try {
    const body = (await request.json()) as { question?: unknown };
    question = typeof body.question === "string" ? body.question.trim() : "";
  } catch { /* fallthrough */ }
  if (!question || question.length > 500) return Response.json({ error: "Please ask a question (up to 500 characters)." }, { status: 400 });

  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) return Response.json({ error: "AI is not configured." }, { status: 500 });

  let summary;
  try { summary = buildSummary(await loadDataset()); }
  catch (e) { console.error(e); return Response.json({ error: "Couldn't load statistics." }, { status: 500 }); }

  const runIdFetch = createLovableAiGatewayRunIdFetch(getLovableAiGatewayRunId(request));
  const provider = createOpenAI({
    baseURL: "https://ai.gateway.lovable.dev/v1",
    apiKey,
    headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    fetch: runIdFetch.fetch,
  });
  const result = streamText({
    model: provider.responses(MODEL),
    instructions: INSTRUCTIONS,
    messages: [{ role: "user", content: `Aggregate data:\n${JSON.stringify(summary)}\n\nQuestion: ${question}` }],
    abortSignal: request.signal,
    maxRetries: 0,
    onError: ({ error }) => console.error("ask error", error),
    providerOptions: {
      openai: { forceReasoning: true, reasoningEffort: "low", reasoningSummary: "auto", store: false, include: ["reasoning.encrypted_content"] },
    },
  });
  return withLovableAiGatewayRunIdHeader(result.toTextStreamResponse(), runIdFetch);
}
