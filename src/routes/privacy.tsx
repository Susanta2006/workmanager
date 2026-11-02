import { createFileRoute } from "@tanstack/react-router";
import LegalPage from "@/components/legal/LegalPage";
import { DEVELOPER } from "@/lib/developer";

export const Route = createFileRoute("/privacy")({
  head: () => ({ meta: [{ title: "Privacy Policy · WorkManager" }, { name: "robots", content: "index, follow" }] }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="November 1, 2026">
      <p>
        This policy explains what information this business workspace collects, why it is used, and the choices you have.
        The workspace is operated by {DEVELOPER.company} (developer: {DEVELOPER.name}).
      </p>

      <h2>Information we collect</h2>
      <p>
        Your Google-provided name and email address, requested role, organization membership and a separately set
        passcode (stored as a salted hash, never in readable form). Business records you enter, such as clients, projects,
        tasks, documents, payments, expenses and uploaded files.
        Basic technical data needed to keep the service secure and working, such as session tokens and error logs.
      </p>

      <h2>How we use it</h2>
      <p>
        To sign you in, show you the records you are allowed to see, generate documents and reports, send notifications you
        have turned on, and keep the service secure. We do not sell personal information and we do not use your business
        records for advertising.
      </p>

      <h2>AI features</h2>
      <p>
        When you use an AI feature, the text you submit is sent to an AI model provider to produce a response. Do not submit
        information you are not allowed to share.
      </p>

      <h2>Service providers</h2>
      <p>
        We use third-party providers for hosting, database, authentication and file storage. If you use an AI feature, the submitted text is also sent to the configured AI provider. WorkManager
        does not store card details.
      </p>

      <h2>Cookies and browser storage</h2>
      <p>
        The app uses essential browser storage for authentication and to remember that you acknowledged the essential-only
        storage notice. It does not currently use advertising or analytics cookies. The notice preference stays in your
        browser’s local storage.
      </p>

      <h2>Access approval</h2>
      <p>
        Accounts are approved by a workspace admin before they can use the workspace. Admins and leaders can see the
        records their role allows.
      </p>

      <h2>Retention and deletion</h2>
      <p>
        Records are kept while the workspace is in use. Export any data you need before you ask for deletion. You can also ask to have your
        account and related data deleted, subject to records we must retain to meet legal obligations.
      </p>

      <h2>Your rights</h2>
      <p>
        You can ask to see, correct or delete your personal information. To make a request, use the contact details on the{" "}
        <a className="underline" href="/developer">Developer page</a>.
      </p>

      <h2>Changes</h2>
      <p>We may update this policy. The date at the top shows the latest version.</p>
    </LegalPage>
  );
}
