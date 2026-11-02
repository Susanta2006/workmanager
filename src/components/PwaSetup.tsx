import { useEffect } from "react";

/** Registers the service worker so the app can be installed on phones and desktops. */
export default function PwaSetup() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator))
      return;
    const register = () =>
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);

  return null;
}
