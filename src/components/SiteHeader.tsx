import { Link, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export function SiteHeader() {
  const navigate = useNavigate();
  const { session } = useAuth();
  return (
    <header className="border-b border-border bg-card">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <Link to="/" className="flex items-baseline gap-3">
          <span className="font-display text-2xl font-bold text-primary">Ward Ledger</span>
          <span className="hidden font-mono text-xs uppercase tracking-widest text-muted-foreground sm:inline">
            operational statistics
          </span>
        </Link>
        <nav className="flex gap-5 text-sm font-medium">
          <Link to="/" className="text-muted-foreground hover:text-foreground" activeProps={{ className: "text-foreground" }} activeOptions={{ exact: true }}>Dashboard</Link>
          <Link to="/toolkit" className="text-muted-foreground hover:text-foreground" activeProps={{ className: "text-foreground" }}>SQL & Python</Link>
          {session ? (<>
          <Link to="/records" className="text-muted-foreground hover:text-foreground" activeProps={{ className: "text-foreground" }}>Records</Link>
          <Link to="/add" className="text-muted-foreground hover:text-foreground" activeProps={{ className: "text-foreground" }}>Add data</Link>
          <button className="text-muted-foreground hover:text-foreground" onClick={async () => { await supabase.auth.signOut(); navigate({ to: "/auth" }); }}>Sign out</button>
          </>) : (
          <Link to="/auth" className="text-muted-foreground hover:text-foreground">Sign in</Link>
          )}
        </nav>
      </div>
      <div className="bg-secondary px-6 py-2 text-center text-xs text-secondary-foreground">
        Synthetic, de-identified data · aggregates only · counts under 5 suppressed · operational statistics, not clinical advice
      </div>
    </header>
  );
}
