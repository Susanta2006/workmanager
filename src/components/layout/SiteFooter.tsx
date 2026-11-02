import { Link } from "@tanstack/react-router";
import { DEVELOPER } from "@/lib/developer";

export default function SiteFooter() {
  return (
    <footer data-no-print className="border-t border-border bg-card/60 px-4 py-6 text-[12px] text-muted-foreground">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-0.5">
          <p className="font-medium text-foreground">
            Developed by {DEVELOPER.name} · {DEVELOPER.company}
          </p>
          <p>Udyam Registration No. {DEVELOPER.udyam}</p>
          <p>© {new Date().getFullYear()} {DEVELOPER.company}. All rights reserved.</p>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-4 gap-y-1">
          <Link to="/security" className="hover:text-foreground">Security</Link>
          <Link to="/privacy" className="hover:text-foreground">Privacy</Link>
          <Link to="/terms" className="hover:text-foreground">Terms</Link>
          <Link to="/developer" className="hover:text-foreground">Developer</Link>
        </nav>
      </div>
    </footer>
  );
}
