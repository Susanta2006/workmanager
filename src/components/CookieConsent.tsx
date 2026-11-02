import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

const CONSENT_KEY = "workmanager-essential-storage-consent-v1";

export default function CookieConsent() {
  const [visible, setVisible] = useState(false);
  const [storageError, setStorageError] = useState("");

  useEffect(() => {
    try {
      setVisible(localStorage.getItem(CONSENT_KEY) !== "accepted");
    } catch (error: any) {
      console.error("Could not read the cookie-consent preference.", error);
      setVisible(true);
      setStorageError("This browser could not read local storage; the notice will remain visible for this visit.");
    }
  }, []);

  function acknowledgeEssentialStorage() {
    try {
      localStorage.setItem(CONSENT_KEY, "accepted");
      setVisible(false);
    } catch (error: any) {
      console.error("Could not save the cookie-consent preference.", error);
      setStorageError("This browser could not save the preference. The notice may appear again.");
    }
  }

  if (!visible) return null;

  return (
    <aside
      aria-label="Cookie and essential storage notice"
      className="fixed inset-x-3 bottom-3 z-[60] mx-auto max-w-3xl rounded-xl border border-border bg-background p-4 shadow-xl sm:inset-x-6 sm:bottom-6"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm leading-relaxed">
          <p className="font-semibold text-foreground">Essential cookies and storage</p>
          <p className="mt-1 text-muted-foreground">
            WorkManager uses essential browser storage to keep you signed in and protect your session. We do not use
            advertising or analytics cookies.{" "}
            <Link to="/privacy" className="font-medium text-primary underline underline-offset-4">Privacy details</Link>
          </p>
          {storageError && <p role="status" className="mt-1 text-xs text-destructive">{storageError}</p>}
        </div>
        <Button className="shrink-0" onClick={acknowledgeEssentialStorage}>
          Continue with essential only
        </Button>
      </div>
    </aside>
  );
}
