import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";

export default function LegalPage({ title, updated, children }: any) {
  const { user } = useAuth();
  return (
    <div className="min-h-[60vh] bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Home
          </Link>
          {user ? (
            <Link to="/dashboard" className="text-sm text-muted-foreground hover:text-foreground">
              Dashboard
            </Link>
          ) : (
            <Link to="/login" className="text-sm text-muted-foreground hover:text-foreground">
              Sign in
            </Link>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        {updated && <p className="mt-1 text-sm text-muted-foreground">Last updated {updated}</p>}
        <div className="mt-8 space-y-4 text-[15px] leading-relaxed text-foreground/90 [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-foreground">
          {children}
        </div>
      </main>
    </div>
  );
}
