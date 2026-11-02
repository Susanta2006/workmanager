import { useEffect } from "react";
import { toast } from "sonner";

const UPDATE_TOAST_ID = "pwa-update";

/**
 * Registers the service worker (so the app can be installed) and tells the user when a new
 * version of the app is ready. Nothing is reloaded without the user's choice, and business
 * data is never stored in the browser, so updating does not touch it.
 */
export default function PwaSetup() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    // Only a page that was already controlled by a worker should reload after an update.
    // A first visit gets a controller too, and reloading then would be pointless.
    const hadController = Boolean(navigator.serviceWorker.controller);
    let reloading = false;

    const applyUpdate = (worker: ServiceWorker) => {
      worker.postMessage({ type: "SKIP_WAITING" });
    };

    const promptUpdate = (worker: ServiceWorker) => {
      toast("A new version of WorkManager is ready", {
        id: UPDATE_TOAST_ID,
        duration: Infinity,
        description:
          "Reloading applies the update. Unsaved text in an open form will be lost; your saved data is not affected.",
        action: { label: "Update now", onClick: () => applyUpdate(worker) },
        cancel: { label: "Later", onClick: () => undefined },
      });
    };

    const onControllerChange = () => {
      if (!hadController || reloading) return;
      reloading = true;
      window.location.reload();
    };

    const watch = (registration: ServiceWorkerRegistration) => {
      if (registration.waiting && navigator.serviceWorker.controller) {
        promptUpdate(registration.waiting);
      }
      registration.addEventListener("updatefound", () => {
        const installing = registration.installing;
        if (!installing) return;
        installing.addEventListener("statechange", () => {
          if (installing.state === "installed" && navigator.serviceWorker.controller) {
            promptUpdate(installing);
          }
        });
      });
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        navigator.serviceWorker.getRegistration().then((registration) => registration?.update());
      }
    };

    // A lazily loaded chunk from an older build can disappear after a deploy. Offer a reload
    // instead of leaving the screen broken.
    const onLoadError = (event: any) => {
      const message = String(event?.reason?.message || event?.message || "");
      if (!/dynamically imported module|Importing a module script failed/i.test(message)) return;
      toast("This page needs the latest version", {
        id: UPDATE_TOAST_ID,
        duration: Infinity,
        description: "Reload to continue. Unsaved text in an open form will be lost.",
        action: { label: "Reload", onClick: () => window.location.reload() },
      });
    };

    const onLoad = async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js");
        watch(registration);
        navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
        document.addEventListener("visibilitychange", onVisible);
      } catch {
        // Registration can fail in private browsing or unsupported contexts; the app still works.
      }
    };

    window.addEventListener("unhandledrejection", onLoadError);
    window.addEventListener("error", onLoadError);
    if (document.readyState === "complete") onLoad();
    else window.addEventListener("load", onLoad, { once: true });

    return () => {
      window.removeEventListener("unhandledrejection", onLoadError);
      window.removeEventListener("error", onLoadError);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return null;
}
