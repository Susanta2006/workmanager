import { createFileRoute } from "@tanstack/react-router";
import LegalPage from "@/components/legal/LegalPage";

export const Route = createFileRoute("/security")({
  head: () => ({
    meta: [
      { title: "Security · WorkManager" },
      { name: "description", content: "How WorkManager keeps company data separate and protected." },
      { name: "robots", content: "index, follow" },
    ],
  }),
  component: SecurityPage,
});

function SecurityPage() {
  return (
    <LegalPage title="Security">
      <p>
        WorkManager is built so that each company’s information stays with that company and only approved people can
        open it. This page summarises those protections in general terms.
      </p>

      <h2>Separate company workspaces</h2>
      <p>
        Every company workspace has its own identifier. Business records, team information and files are linked to that
        identifier, and access rules stop people from one company from reading or changing another company’s data.
        Your company is determined by your verified account, not by anything you type into a page.
      </p>

      <h2>Who can sign in</h2>
      <p>
        Sign-in uses your Google account. A new account must be approved by the company’s administrator before it can
        open any company data. Approval and role changes are recorded and can be reversed.
      </p>

      <h2>Roles and permissions</h2>
      <p>
        Administrators, leaders and members see only what their role allows. Members can work on tasks assigned to
        them; sensitive financial records such as payments and expenses are limited to administrators and leaders.
      </p>

      <h2>Second step: workspace passcode</h2>
      <p>
        After Google sign-in, each person sets a separate passcode for WorkManager. Repeated wrong attempts temporarily
        lock the passcode check, and access expires after a set period so the workspace must be unlocked again.
      </p>

      <h2>Files</h2>
      <p>
        Receipts and other private documents are stored in access-controlled storage and can be opened only through
        short-lived links for approved users of the same company. Company logos and signatures are public by design, so
        do not upload confidential material as a logo or signature.
      </p>

      <h2>Browser storage</h2>
      <p>
        WorkManager uses essential browser storage for your sign-in session and your cookie notice choice. It does not
        load advertising or tracking cookies.
      </p>

      <h2>Report a security concern</h2>
      <p>
        If you think something is wrong, tell your workspace administrator first. You can also contact the developer
        using the details on the Developer page. Please do not test for weaknesses in company data that is not yours.
      </p>
    </LegalPage>
  );
}
