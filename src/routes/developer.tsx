import { createFileRoute, Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { DEVELOPER } from "@/lib/developer";

const PRODUCT = "WorkManager";
const SITE_URL = ((import.meta.env.VITE_SITE_URL as string | undefined) ?? "").replace(/\/$/, "");
const PAGE_TITLE = `${DEVELOPER.name} · Developer of ${PRODUCT}`;
const PAGE_DESCRIPTION = `${DEVELOPER.name}, ${DEVELOPER.title}, developer of ${PRODUCT}.`;

const absolute = (path: string) => `${SITE_URL}${path}`;

function structuredData() {
  return {
    "@context": "https://schema.org",
    "@type": "Person",
    "@id": `${SITE_URL}/developer#person`,
    name: DEVELOPER.name,
    jobTitle: DEVELOPER.title,
    email: `mailto:${DEVELOPER.email}`,
    worksFor: { "@type": "Organization", name: DEVELOPER.company },
    sameAs: [DEVELOPER.website, ...DEVELOPER.profiles.map((profile) => profile.url)],
    alumniOf: DEVELOPER.education.map((item) => ({ "@type": "CollegeOrUniversity", name: item.school })),
  };
}

export const Route = createFileRoute("/developer")({
  head: () => {
    const meta: Array<Record<string, string>> = [
      { title: PAGE_TITLE },
      { name: "description", content: PAGE_DESCRIPTION },
      { name: "author", content: DEVELOPER.name },
      { name: "robots", content: "index, follow" },
      { property: "og:type", content: "profile" },
      { property: "og:title", content: PAGE_TITLE },
      { property: "og:description", content: PAGE_DESCRIPTION },
      { name: "twitter:card", content: "summary" },
    ];
    if (SITE_URL) {
      meta.push(
        { property: "og:url", content: absolute("/developer") },
        { property: "og:image", content: absolute("/og-image.png") },
        { name: "twitter:image", content: absolute("/og-image.png") },
      );
    }
    return {
      meta,
      links: SITE_URL ? [{ rel: "canonical", href: absolute("/developer") }] : [],
      scripts: [{ type: "application/ld+json", children: JSON.stringify(structuredData()) }],
    };
  },
  component: DeveloperPage,
});

function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
      {children}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="border-b border-border pb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function DeveloperPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <Link to="/" className="font-semibold tracking-tight hover:text-primary">
            {PRODUCT}
          </Link>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 pb-16 pt-10">
        <h1 className="text-3xl font-bold tracking-tight">{DEVELOPER.name}</h1>
        <p className="mt-1 text-base text-muted-foreground">{DEVELOPER.title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{DEVELOPER.location}</p>

        <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm">
          <li>
            <a href={`mailto:${DEVELOPER.email}`} className="text-primary hover:underline">
              {DEVELOPER.email}
            </a>
          </li>
          <li>
            <ExternalLink href={DEVELOPER.website}>Portfolio</ExternalLink>
          </li>
          {DEVELOPER.profiles.map((profile) => (
            <li key={profile.label}>
              <ExternalLink href={profile.url}>{profile.label}</ExternalLink>
            </li>
          ))}
        </ul>

        <Section title="Business">
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Company</dt>
              <dd className="mt-0.5 font-medium">{DEVELOPER.company}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Udyam registration number</dt>
              <dd className="mt-0.5 font-mono font-medium">{DEVELOPER.udyam}</dd>
            </div>
          </dl>
        </Section>

        <Section title="Experience">
          <ul className="divide-y divide-border">
            {DEVELOPER.experience.map((item) => (
              <li key={`${item.role}-${item.org}`} className="flex flex-col gap-0.5 py-3 sm:flex-row sm:justify-between">
                <p className="font-medium">
                  {item.role}
                  <span className="font-normal text-muted-foreground"> · {item.org}</span>
                </p>
                {item.period && <p className="text-sm text-muted-foreground">{item.period}</p>}
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Education">
          <ul className="space-y-3 text-sm">
            {DEVELOPER.education.map((item) => (
              <li key={item.school}>
                <p className="font-medium">{item.degree}</p>
                <p className="text-muted-foreground">
                  {item.school} · {item.period}
                </p>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm text-muted-foreground">Certifications: {DEVELOPER.certifications.join(" · ")}</p>
        </Section>

        <Section title="Publications and writing">
          <ul className="space-y-3 text-sm">
            {DEVELOPER.writing.map((item) => (
              <li key={item.url}>
                <ExternalLink href={item.url}>{item.title}</ExternalLink>
                <p className="text-muted-foreground">{item.venue}</p>
              </li>
            ))}
          </ul>
        </Section>
      </main>
    </div>
  );
}
