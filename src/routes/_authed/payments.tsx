import { refreshWorkspaceData } from "@/lib/sync";
import ClientRef from "@/components/common/ClientRef";
import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Pencil, Plus, Search, Trash2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { backend } from "@/api/backend";
import { fetchAll, logActivity, syncPaymentBalances } from "@/lib/db";
import { useAuth } from "@/lib/AuthContext";
import { usePermissions } from "@/lib/permissions";
import {
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS,
} from "@/lib/constants";
import { downloadCsv, fmtDate, inr, num, toCsv } from "@/lib/format";
import PageHeader from "@/components/common/PageHeader";
import DataToolbar from "@/components/common/DataToolbar";
import EmptyState from "@/components/common/EmptyState";
import StatusBadge from "@/components/common/StatusBadge";
import StatCard from "@/components/common/StatCard";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import PaymentDialog from "@/components/payments/PaymentDialog";
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

export const Route = createFileRoute("/_authed/payments")({
  validateSearch: validateNewRecordSearch,
  head: () => ({ meta: [{ title: "Payments · WorkManager" }] }),
  component: PaymentsPage,
});

function PaymentsPage() {
  const { user } = useAuth();
  const { canDelete } = usePermissions();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [method, setMethod] = useState("all");
  const [status, setStatus] = useState("all");
  const prefill = Route.useSearch();
  const [dialog, setDialog] = useState<any>(() => ({
    open: prefill.new === true,
    payment: null as any,
    defaults: prefill.client ? { client_id: prefill.client } : {},
  }));
  const [deleting, setDeleting] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["payments-page"],
    queryFn: async () => {
      const [payments, clients, projects, documents] = await Promise.all([
        fetchAll("Payment", null),
        fetchClients(),
        fetchAll("Project", null),
        fetchAll("Document", null),
      ]);
      return { payments, clients, projects, documents };
    },
  });

  const rows = useMemo(() => {
    const clientsById = Object.fromEntries(
      (data?.clients || []).map((c: any) => [c.id, c]),
    );
    const docsById = Object.fromEntries(
      (data?.documents || []).map((d: any) => [d.id, d]),
    );
    const projectsById = Object.fromEntries(
      (data?.projects || []).map((p: any) => [p.id, p]),
    );
    return (data?.payments || [])
      .filter((payment: any) => {
        if (method !== "all" && payment.method !== method) return false;
        if (status !== "all" && payment.status !== status) return false;
        if (search) {
          const projectTitle = projectsById[payment.project_id || docsById[payment.document_id]?.project_id]?.title || "";
          const haystack =
            `${payment.payment_code} ${payment.reference} ${payment.notes} ${clientsById[payment.client_id]?.name || ""} ${projectTitle}`.toLowerCase();
          if (!haystack.includes(search.toLowerCase())) return false;
        }
        return true;
      })
      .sort((a: any, b: any) =>
        String(b.payment_date || "").localeCompare(
          String(a.payment_date || ""),
        ),
      )
      .map((payment: any) => {
        const doc = docsById[payment.document_id];
        const projectId = payment.project_id || doc?.project_id || "";
        return {
          payment,
          client: clientsById[payment.client_id],
          doc,
          project: projectsById[projectId],
        };
      });
  }, [data, search, method, status]);

  const totals = useMemo(() => {
    const payments = data?.payments || [];
    const received = payments
      .filter((p: any) => p.status === "received")
      .reduce((sum: any, p: any) => sum + num(p.amount), 0);
    const refunded = payments
      .filter((p: any) => p.status === "refunded")
      .reduce((sum: any, p: any) => sum + num(p.amount), 0);
    const pending = payments
      .filter((p: any) => p.status === "pending")
      .reduce((sum: any, p: any) => sum + num(p.amount), 0);
    return { received, refunded, pending, net: received - refunded };
  }, [data]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["payments-page"] });
    refreshWorkspaceData(queryClient);
    queryClient.invalidateQueries({ queryKey: ["documents-page"] });
  };

  const exportCsv = () => {
    const csv = toCsv(rows, [
      { label: "Payment code", value: (r: any) => r.payment.payment_code },
      { label: "Client", value: (r: any) => r.client?.name || "" },
      { label: "Client ID", value: (r: any) => r.client?.client_code || "" },
      { label: "Invoice", value: (r: any) => r.doc?.doc_number || "" },
      { label: "Project", value: (r: any) => r.project?.title || "" },
      { label: "Date", value: (r: any) => fmtDate(r.payment.payment_date) },
      { label: "Amount (₹)", value: (r: any) => num(r.payment.amount).toFixed(2) },
      {
        label: "Method",
        value: (r: any) =>
          PAYMENT_METHOD_LABELS[r.payment.method] || r.payment.method,
      },
      { label: "Reference", value: (r: any) => r.payment.reference },
      { label: "Status", value: (r: any) => r.payment.status },
    ]);
    downloadCsv(`payments-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  };

  const remove = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await backend.entities.Payment.delete(deleting.id);
      // Refreshes the removed entry's document and every invoice and receipt in its project.
      await syncPaymentBalances(deleting);
      await logActivity({
        user,
        action: "Payment entry removed",
        entityType: "Payment",
        entityId: deleting.id,
        label: `${deleting.payment_code} · ${inr(deleting.amount)}`,
        details: deleting.document_id || deleting.project_id ? "Balances recalculated" : "",
      });
      toast.success("Payment entry removed and balances recalculated");
      setDeleting(null);
      refresh();
    } catch (error: any) {
      toast.error(error?.message || "Could not remove this payment.");
    } finally {
      setBusy(false);
    }
  };

  if (isLoading) return <Skeleton className="h-[420px] rounded-xl" />;

  return (
    <div>
      <PageHeader
        title="Payments"
        description="A ledger of money actually received — partial payments, multiple instalments and refunds."
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
          onClick={() => setDialog({ open: true, payment: null, defaults: {} })}
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" /> Record payment
        </Button>
      </PageHeader>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Received"
          value={inr(totals.received)}
          hint="Recorded receipts"
          tone="emerald"
        />
        <StatCard
          label="Refunds"
          value={inr(totals.refunded)}
          hint="Returned to clients"
          tone="rose"
        />
        <StatCard
          label="Net collected"
          value={inr(totals.net)}
          hint="Received minus refunds"
          tone="blue"
        />
        <StatCard
          label="Pending"
          value={inr(totals.pending)}
          hint="Promised, not yet received"
          tone="amber"
        />
      </div>

      <DataToolbar>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by code, client or reference"
            className="h-9 bg-white pl-9 text-[13px]"
          />
        </div>
        <Select value={method} onValueChange={setMethod}>
          <SelectTrigger className="h-9 w-[150px] bg-white text-[12.5px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All methods</SelectItem>
            {PAYMENT_METHODS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-9 w-[140px] bg-white text-[12.5px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All entries</SelectItem>
            {Object.entries(PAYMENT_STATUS).map(([value, meta]) => (
              <SelectItem key={value} value={value}>
                {meta.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </DataToolbar>

      {rows.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title={
            data?.payments?.length
              ? "No payments match these filters"
              : "No payments yet"
          }
          description={
            data?.payments?.length
              ? "Try another method or status."
              : "Record your first payment to start tracking collections."
          }
          action={
            <Button
              size="sm"
              onClick={() =>
                setDialog({ open: true, payment: null, defaults: {} })
              }
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Record payment
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
                    Payment
                  </TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Client
                  </TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Against / project
                  </TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Method
                  </TableHead>
                  <TableHead className="text-right text-[11px] uppercase tracking-wide text-muted-foreground">
                    Amount
                  </TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Status
                  </TableHead>
                  <TableHead className="w-[90px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(({ payment, client, doc, project }: any) => (
                  <TableRow key={payment.id} className="hover:bg-slate-50/60">
                    <TableCell>
                      <p className="text-[12.5px] font-semibold">
                        {payment.payment_code || "—"}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {fmtDate(payment.payment_date)}
                      </p>
                    </TableCell>
                    <TableCell className="text-[12.5px]">
                      {client ? (
                        <Link
                          to="/clients/$clientId"
                          params={{ clientId: client.id }}
                          className="hover:text-primary"
                        >
                          <ClientRef client={client} />
                        </Link>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-[12px]">
                      {doc ? (
                        <Link
                          to="/documents/$documentId"
                          params={{ documentId: doc.id }}
                          className="text-primary hover:underline"
                        >
                          {doc.doc_number}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">Unlinked</span>
                      )}
                      {project ? (
                        <span className="block text-[10.5px] text-muted-foreground">
                          {project.title}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-[12px] text-muted-foreground">
                      {PAYMENT_METHOD_LABELS[payment.method] || payment.method}
                      {payment.reference ? (
                        <span className="block text-[10.5px]">
                          {payment.reference}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell
                      className={`text-right text-[12.5px] font-semibold tabular-nums ${payment.status === "refunded" ? "text-rose-600" : "text-emerald-700"}`}
                    >
                      {payment.status === "refunded" ? "−" : ""}
                      {inr(payment.amount)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        status={payment.status}
                        map={PAYMENT_STATUS}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() =>
                            setDialog({ open: true, payment, defaults: {} })
                          }
                          title="Edit"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        {canDelete && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-rose-500"
                            onClick={() => setDeleting(payment)}
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

      <PaymentDialog
        open={dialog.open}
        onOpenChange={(open: any) => setDialog((prev: any) => ({ ...prev, open }))}
        payment={dialog.payment}
        clients={data?.clients ?? []}
        projects={data?.projects ?? []}
        documents={data?.documents ?? []}
        defaults={dialog.defaults}
        onSaved={refresh}
      />

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open: any) => !open && setDeleting(null)}
        title="Remove this payment entry?"
        description={`${deleting?.payment_code || "The payment"} (${inr(deleting?.amount)}) will be removed and any linked invoice balance recalculated. The action is recorded in the activity log.`}
        confirmLabel="Remove entry"
        destructive
        onConfirm={remove}
        busy={busy}
      />
    </div>
  );
}
