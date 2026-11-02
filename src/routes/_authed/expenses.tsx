import { refreshWorkspaceData } from "@/lib/sync";
import ClientRef from "@/components/common/ClientRef";
import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Download,
  ExternalLink,
  Pencil,
  Plus,
  Receipt,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { backend } from "@/api/backend";
import { fetchAll, logActivity } from "@/lib/db";
import { useAuth } from "@/lib/AuthContext";
import { usePermissions } from "@/lib/permissions";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABELS,
  PAYMENT_METHOD_LABELS,
} from "@/lib/constants";
import { downloadCsv, fmtDate, inr, monthKey, num, toCsv } from "@/lib/format";
import PageHeader from "@/components/common/PageHeader";
import DataToolbar from "@/components/common/DataToolbar";
import EmptyState from "@/components/common/EmptyState";
import StatCard from "@/components/common/StatCard";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import ExpenseDialog from "@/components/expenses/ExpenseDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchClients } from "@/lib/clients";
import { validateNewRecordSearch } from "@/lib/new-record-search";

export const Route = createFileRoute("/_authed/expenses")({
  validateSearch: validateNewRecordSearch,
  head: () => ({ meta: [{ title: "Expenses · WorkManager" }] }),
  component: ExpensesPage,
});

function ExpensesPage() {
  const { user } = useAuth();
  const { canDelete } = usePermissions();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [month, setMonth] = useState("");
  const prefill = Route.useSearch();
  const [dialog, setDialog] = useState<any>(() => ({
    open: prefill.new === true,
    expense: null as any,
    defaults: prefill.client ? { client_id: prefill.client } : undefined,
  }));
  const [deleting, setDeleting] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["expenses-page"],
    queryFn: async () => {
      const [expenses, clients, projects] = await Promise.all([
        fetchAll("Expense", null),
        fetchClients(),
        fetchAll("Project", null),
      ]);
      return { expenses, clients, projects };
    },
  });

  const rows = useMemo(() => {
    const clientsById = Object.fromEntries(
      (data?.clients || []).map((c: any) => [c.id, c]),
    );
    return (data?.expenses || [])
      .filter((expense: any) => {
        if (category !== "all" && expense.category !== category) return false;
        if (month && monthKey(expense.expense_date) !== month) return false;
        if (search) {
          const haystack =
            `${expense.title} ${expense.vendor} ${expense.description} ${expense.expense_code}`.toLowerCase();
          if (!haystack.includes(search.toLowerCase())) return false;
        }
        return true;
      })
      .sort((a: any, b: any) =>
        String(b.expense_date || "").localeCompare(
          String(a.expense_date || ""),
        ),
      )
      .map((expense: any) => ({ expense, client: clientsById[expense.client_id] }));
  }, [data, search, category, month]);

  const totals = useMemo(() => {
    const expenses = data?.expenses || [];
    const thisMonth = monthKey(new Date());
    const byCategory: Record<string, any> = {};
    expenses.forEach((expense: any) => {
      (byCategory as Record<string, any>)[expense.category] =
        ((byCategory as Record<string, any>)[expense.category] || 0) + num(expense.amount);
    });
    const top = Object.entries(byCategory).sort((a: any, b: any) => b[1] - a[1])[0];
    return {
      all: expenses.reduce((sum: any, e: any) => sum + num(e.amount), 0),
      month: expenses
        .filter((e: any) => monthKey(e.expense_date) === thisMonth)
        .reduce((sum: any, e: any) => sum + num(e.amount), 0),
      top: top
        ? `${EXPENSE_CATEGORY_LABELS[top[0]] || top[0]} · ${inr(top[1])}`
        : "—",
      filtered: rows.reduce((sum: any, r: any) => sum + num(r.expense.amount), 0),
    };
  }, [data, rows]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["expenses-page"] });
    refreshWorkspaceData(queryClient);
  };

  const openReceipt = async (expense: any) => {
    try {
      const { signed_url } = await backend.files.signedUrl(
        { file_uri: expense.receipt_uri },
      );
      window.open(signed_url, "_blank", "noopener");
    } catch (error: any) {
      toast.error(error?.message || "Could not open this receipt.");
    }
  };

  const remove = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await backend.entities.Expense.delete(deleting.id);
      await logActivity({
        user,
        action: "Expense deleted",
        entityType: "Expense",
        entityId: deleting.id,
        label: `${deleting.expense_code} · ${inr(deleting.amount)}`,
      });
      toast.success("Expense deleted");
      setDeleting(null);
      refresh();
    } catch (error: any) {
      toast.error(error?.message || "Could not delete this expense.");
    } finally {
      setBusy(false);
    }
  };

  const exportCsv = () => {
    const csv = toCsv(rows, [
      { label: "Code", value: (r: any) => r.expense.expense_code },
      { label: "Date", value: (r: any) => fmtDate(r.expense.expense_date) },
      { label: "Title", value: (r: any) => r.expense.title },
      {
        label: "Category",
        value: (r: any) =>
          EXPENSE_CATEGORY_LABELS[r.expense.category] || r.expense.category,
      },
      { label: "Vendor", value: (r: any) => r.expense.vendor },
      { label: "Client", value: (r: any) => r.client?.name || "" },
      { label: "Amount (₹)", value: (r: any) => num(r.expense.amount).toFixed(2) },
      {
        label: "Method",
        value: (r: any) =>
          PAYMENT_METHOD_LABELS[r.expense.payment_method] ||
          r.expense.payment_method,
      },
    ]);
    downloadCsv(`expenses-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  };

  if (isLoading) return <Skeleton className="h-[420px] rounded-xl" />;

  return (
    <div>
      <PageHeader
        title="Expenses"
        description="Hosting, domains, software, contractors — every business cost in one ledger."
      >
        <Button
          variant="outline"
          size="sm"
          onClick={exportCsv}
          disabled={!rows.length}
        >
          <Download className="mr-1.5 h-3.5 w-3.5" /> Export CSV
        </Button>
        <Button
          size="sm"
          onClick={() => setDialog({ open: true, expense: null })}
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" /> New expense
        </Button>
      </PageHeader>

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Total recorded"
          value={inr(totals.all)}
          hint={`${(data?.expenses || []).length} entries`}
          tone="rose"
        />
        <StatCard
          label="This month"
          value={inr(totals.month)}
          hint="Current calendar month"
          tone="amber"
        />
        <StatCard
          label="Largest category"
          value={totals.top}
          hint="Across all time"
          tone="violet"
        />
      </div>

      <DataToolbar>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search expenses"
            className="h-9 bg-white pl-9 text-[13px]"
          />
        </div>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="h-9 w-[160px] bg-white text-[12.5px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {EXPENSE_CATEGORIES.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="h-9 w-[150px] bg-white text-[12.5px]"
        />
        {month && (
          <Button variant="ghost" size="sm" onClick={() => setMonth("")}>
            Clear
          </Button>
        )}
        <span className="ml-auto text-[12px] text-muted-foreground">
          Filtered total:{" "}
          <strong className="text-slate-800">{inr(totals.filtered)}</strong>
        </span>
      </DataToolbar>

      {rows.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title={
            data?.expenses?.length
              ? "No expenses match these filters"
              : "No expenses yet"
          }
          description={
            data?.expenses?.length
              ? "Try another category or month."
              : "Track hosting, tools and contractor costs here."
          }
          action={
            <Button
              size="sm"
              onClick={() => setDialog({ open: true, expense: null })}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Add expense
            </Button>
          }
        />
      ) : (
        <div className="surface overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/70">
                  <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Expense
                  </TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Category
                  </TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Vendor
                  </TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Linked to
                  </TableHead>
                  <TableHead className="text-right text-[11px] uppercase tracking-wide text-muted-foreground">
                    Amount
                  </TableHead>
                  <TableHead className="w-[130px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(({ expense, client }: any) => (
                  <TableRow key={expense.id} className="hover:bg-slate-50/60">
                    <TableCell>
                      <p className="text-[12.5px] font-semibold">
                        {expense.title}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {fmtDate(expense.expense_date)} · {expense.expense_code}
                      </p>
                    </TableCell>
                    <TableCell className="text-[12px] text-slate-600">
                      {EXPENSE_CATEGORY_LABELS[expense.category] ||
                        expense.category}
                    </TableCell>
                    <TableCell className="text-[12px] text-slate-600">
                      {expense.vendor || "—"}
                    </TableCell>
                    <TableCell className="text-[12px]">
                      {client ? (
                        <Link
                          to="/clients/$clientId"
                          params={{ clientId: client.id }}
                          className="text-primary hover:underline"
                        >
                          <ClientRef client={client} />
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-[12.5px] font-semibold tabular-nums text-rose-600">
                      −{inr(expense.amount)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        {expense.receipt_uri && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => openReceipt(expense)}
                            title="Open receipt"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => setDialog({ open: true, expense })}
                          title="Edit"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        {canDelete && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-rose-500"
                            onClick={() => setDeleting(expense)}
                            title="Delete"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      <ExpenseDialog
        open={dialog.open}
        onOpenChange={(open: any) => setDialog((prev: any) => ({ ...prev, open }))}
        expense={dialog.expense}
        defaults={dialog.defaults}
        clients={data?.clients ?? []}
        projects={data?.projects ?? []}
        onSaved={refresh}
      />

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open: any) => !open && setDeleting(null)}
        title="Delete this expense?"
        description={`${deleting?.title || "The expense"} (${inr(deleting?.amount)}) will be removed. The deletion is recorded in the activity log.`}
        confirmLabel="Delete expense"
        destructive
        onConfirm={remove}
        busy={busy}
      />
    </div>
  );
}
