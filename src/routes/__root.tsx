import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRouteWithContext,
  useRouterState,
} from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import { DefaultCatchBoundary } from "@/components/DefaultCatchBoundary";
import { NotFound } from "@/components/NotFound";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/lib/AuthContext";
import PwaSetup from "@/components/PwaSetup";
import SiteFooter from "@/components/layout/SiteFooter";
import CookieConsent from "@/components/CookieConsent";
import appCss from "@/index.css?url";
import { DEVELOPER } from "@/lib/developer";

const APP_NAME = "WorkManager";
const TITLE = `${APP_NAME} · Business Workspace`;
const DESCRIPTION =
  "WorkManager is a business workspace for clients, projects, documents, payments, expenses and live reports.";
const THEME = "#1d6fe0";
const BRAND = "#0052FF";

// Optional. Set VITE_SITE_URL (e.g. https://workplace.example.com) so social
// previews get absolute image and canonical URLs, which crawlers require.
const SITE_URL = ((import.meta.env.VITE_SITE_URL as string | undefined) || "").replace(/\/$/, "");
const abs = (path: string) => `${SITE_URL}${path}`;

// The router context is typed, so every beforeLoad guard can read context.queryClient.
export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => {
    const meta: Array<Record<string, string>> = [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      {
        name: "keywords",
        content:
          "business workspace, client management, project management, documents, invoices, payments, expenses, reports, WorkManager",
      },
      {
        name: "google-site-verification",
        content: "8o9Dm94uzc3XtGBMijfLCeGXH8k0MQgKiY1eZskSbjE",
      },
      { name: "author", content: DEVELOPER.company },
      { name: "robots", content: "index, follow" },
      { name: "application-name", content: APP_NAME },
      { name: "theme-color", content: THEME },
      { name: "msapplication-TileColor", content: BRAND },
      { name: "msapplication-TileImage", content: "/mstile-150x150.png" },
      { name: "msapplication-config", content: "/browserconfig.xml" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "default" },
      { name: "apple-mobile-web-app-title", content: APP_NAME },
      { name: "mobile-web-app-capable", content: "yes" },
      // Open Graph
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: APP_NAME },
      { property: "og:locale", content: "en_IN" },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:image:type", content: "image/png" },
      { property: "og:image:alt", content: `${APP_NAME} — clients, projects, documents, payments and reports` },
      // Twitter / X
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: DESCRIPTION },
      { name: "twitter:image:alt", content: `${APP_NAME} — business workspace` },
    ];

    if (SITE_URL) {
      meta.push(
        { property: "og:url", content: abs("/") },
        { property: "og:image", content: abs("/og-image.png") },
        { property: "og:image:secure_url", content: abs("/og-image.png") },
        { name: "twitter:image", content: abs("/og-image.png") },
      );
    }

    const links: Array<Record<string, string>> = [
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "icon", href: "/favicon.ico", sizes: "any" },
      { rel: "icon", type: "image/png", sizes: "16x16", href: "/favicon-16x16.png" },
      { rel: "icon", type: "image/png", sizes: "32x32", href: "/favicon-32x32.png" },
      { rel: "icon", type: "image/svg+xml", href: "/icon.svg" },
      { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon.png" },
    ];

    if (SITE_URL) links.push({ rel: "canonical", href: abs("/") });

    const structuredData = {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "SoftwareApplication",
          name: APP_NAME,
          applicationCategory: "BusinessApplication",
          operatingSystem: "Any",
          description: DESCRIPTION,
          ...(SITE_URL ? { url: abs("/"), image: abs("/og-image.png") } : {}),
          author: { "@type": "Organization", name: DEVELOPER.company },
        },
        {
          "@type": "Organization",
          name: DEVELOPER.company,
          identifier: { "@type": "PropertyValue", name: "Udyam Registration Number", value: DEVELOPER.udyam },
          ...(SITE_URL ? { url: SITE_URL, logo: abs("/icon-512.png") } : {}),
        },
      ],
    };

    return {
      meta,
      links,
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify(structuredData),
        },
      ],
    };
  },
  errorComponent: DefaultCatchBoundary,
  notFoundComponent: () => <NotFound />,
  shellComponent: RootDocument,
  component: RootComponent,
});

function RootComponent() {
  // The workspace renders its own footer inside the app shell; public pages get it here.
  const inWorkspace = useRouterState({
    select: (state) => state.matches.some((match) => match.routeId === "/_authed"),
  });
  return (
    <AuthProvider>
      <div className="flex min-h-screen flex-col">
        <div className="flex-1">
          <Outlet />
        </div>
        {!inWorkspace && <SiteFooter />}
      </div>
      <PwaSetup />
      <CookieConsent />
      <Toaster position="top-right" richColors closeButton />
    </AuthProvider>
  );
}

// The document. There is no index.html: the server renders <html> from here.
function RootDocument({ children }: any) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body data-react-root="true">
        {children}
        <Scripts />
      </body>
    </html>
  );
}
