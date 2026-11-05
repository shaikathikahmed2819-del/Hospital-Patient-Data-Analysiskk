import { useRef, useState } from "react";
import { Loader2, Send, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const EXAMPLES = [
  "Which department is busiest and how has it changed month to month?",
  "Which weekdays have the highest visit load?",
  "How do emergency visits compare with outpatient visits?",
];

export function AskPanel() {
  const [q, setQ] = useState("");
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ctrl = useRef<AbortController | null>(null);

  async function ask(question: string) {
    if (!question.trim() || busy) return;
    setQ(question); setAnswer(""); setError(null); setBusy(true);
    ctrl.current = new AbortController();
    try {
      const res = await fetch("/api/public/ask", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }), signal: ctrl.current.signal,
      });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => null);
        setError(j?.error ?? (res.status === 429 ? "Too many requests, try again shortly." : res.status === 402 ? "AI usage limit reached." : "Something went wrong."));
        return;
      }
      const reader = res.body.getReader(); const dec = new TextDecoder(); let got = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        got += dec.decode(value, { stream: true }); setAnswer(got);
      }
      if (!got.trim()) setError("No answer was returned. Please try again later.");
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError("Connection failed.");
    } finally { setBusy(false); }
  }

  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <h2 className="font-display text-lg font-semibold">Ask about the trends</h2>
      <p className="mb-4 text-xs text-muted-foreground">AI-powered explanations of aggregate totals only. Not clinical advice.</p>
      <form onSubmit={(e) => { e.preventDefault(); ask(q); }} className="flex gap-2">
        <Textarea value={q} onChange={(e) => setQ(e.target.value)} maxLength={500} rows={2} placeholder="e.g. Why did visits rise in winter?"
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(q); } }} className="min-h-0 resize-none" />
        {busy
          ? <Button type="button" variant="outline" size="icon" onClick={() => ctrl.current?.abort()} aria-label="Stop"><Square className="size-4" /></Button>
          : <Button type="submit" size="icon" aria-label="Ask"><Send className="size-4" /></Button>}
      </form>
      <div className="mt-3 flex flex-wrap gap-2">
        {EXAMPLES.map((ex) => (
          <button key={ex} onClick={() => ask(ex)} disabled={busy} className="rounded-full border border-border bg-secondary px-3 py-1 text-xs text-secondary-foreground hover:bg-muted disabled:opacity-50">{ex}</button>
        ))}
      </div>
      {(busy || answer || error) && (
        <div className="mt-4 rounded-md bg-muted p-4 text-sm leading-relaxed">
          {error ? <p className="text-destructive">{error}</p>
            : answer ? <p className="whitespace-pre-wrap">{answer}</p>
            : <p className="flex items-center gap-2 text-muted-foreground"><Loader2 className="size-4 animate-spin" />Reading the statistics…</p>}
        </div>
      )}
    </section>
  );
}
