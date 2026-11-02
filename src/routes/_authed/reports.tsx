import { createFileRoute, Outlet } from "@tanstack/react-router";
import PageHeader from "@/components/common/PageHeader";
import ReportTabs from "@/components/reports/ReportTabs";
import ReportLive from "@/components/reports/ReportLive";

export const Route = createFileRoute("/_authed/reports")({
  head: () => ({ meta: [{ title: "Reports · WorkManager" }] }),
  component: ReportsLayout,
});

function ReportsLayout() {
  return (
    <div>
      <PageHeader
        title="Reports"
        description="Monthly profit and expenses, annual summaries, and live status reports for clients, projects, tasks and expenses."
      >
        <ReportLive />
      </PageHeader>
      <ReportTabs />
      <Outlet />
    </div>
  );
}
