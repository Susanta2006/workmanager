import { lazy, Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";

// Charts load their library only when they are shown, so the rest of the page appears first.
// Each wrapper keeps the same name and props as the chart it loads.
function lazyChart(load: any, name: any) {
  const Chart = lazy(() => load().then((module: any) => ({ default: module[name] })));
  return function LazyChart(props: any) {
    return (
      <Suspense fallback={<Skeleton className="h-[240px] w-full rounded-xl" />}>
        <Chart {...props} />
      </Suspense>
    );
  };
}

const loadDashboard = () => import("@/components/dashboard/Charts");
const loadFinancial = () => import("@/components/reports/FinancialCharts");

export const RevenueExpenseChart = lazyChart(loadDashboard, "RevenueExpenseChart");
export const CollectionsChart = lazyChart(loadDashboard, "CollectionsChart");
export const DistributionChart = lazyChart(loadDashboard, "DistributionChart");
export const ExpenseCategoryChart = lazyChart(loadDashboard, "ExpenseCategoryChart");
export const MonthlyProfitChart = lazyChart(loadFinancial, "MonthlyProfitChart");
export const YearlyProfitChart = lazyChart(loadFinancial, "YearlyProfitChart");
export const ExpenseTrendChart = lazyChart(loadFinancial, "ExpenseTrendChart");
