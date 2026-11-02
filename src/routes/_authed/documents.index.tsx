import ClientRef from "@/components/common/ClientRef";
import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FileText, Plus, Search } from "lucide-react";
import { fetchAll, syncAllBalances } from "@/lib/db";
import { useOrgSettings } from "@/lib/org-settings";
import { DOC_TYPES, DOC_STATUS, docTypeLabel } from "@/lib/doc-types";
import { downloadCsv, fmtDate, inr, num, toCsv } from "@/lib/format";
import PageHeader from "@/components/common/PageHeader";
import DataToolbar from "@/components/common/DataToolbar";
import EmptyState from "@/components/common/EmptyState";
import StatusBadge from "@/components/common/StatusBadge";
import StatCard from "@/components/common/StatCard";
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
import { balanceOf } from "@/lib/doc-finance";

export const Route = createFileRoute("/_authed/documents/")({
  head: () => ({ meta: [{ title: "Documents · WorkManager" }] }),
  component: DocumentsPage,
});

function DocumentsPage() {
  const { settings, isLoading: settingsLoading } = useOrgSettings();
  const [search, setSearch] = useState("");
  const [type, setType] = useState("all");
  const [status, setStatus] = useState("all");

  const { data, isLoading } = useQuery({
    queryKey: ["documents-page"],
    queryFn: async () => {
      const [documents, clients] = await Promise.all([
        fetchAll("Document", null),
        fetchClients(),
      ]);
      return { documents, clients };
    },
  });

  const queryClient = useQueryClient();
  const [checked, setChecked] = useState(false);
  // One-time check per visit: fixes any cached balance that no longer matches the payment ledger.
  useEffect(() => {
    if (!data || checked) return;
    setChecked(true);
    syncAllBalances()
      .then((changed) => {
        if (changed > 0) queryClient.invalidateQueries({ queryKey: ["documents-page"] });
      })
      .catch(() => undefined);
  }, [data, checked, queryClient]);

  const rows = useMemo(() => {
    const clientsById = Object.fromEntries(
      (data?.clients || []).map((c: any) => [c.id, c]),
    );
    return (data?.documents || [])
      .filter((doc: any) => {
        if (type !== "all" && doc.doc_type !== type) return false;
        if (status !== "all" && doc.status !== status) return false;
        if (search) {
          const haystack =
            `${doc.doc_number} ${doc.title} ${clientsById[doc.client_id]?.name || ""}`.toLowerCase();
          if (!haystack.includes(search.toLowerCase())) return false;
        }
        return true;
      })
      .sort((a: any, b: any) =>
        String(b.issue_date || "").localeCompare(String(a.issue_date || "")),
      )
      .map((doc: any) => ({ doc, client: clientsById[doc.client_id] }));
  }, [data, search, type, status]);

  const totals = useMemo(() => {
    const invoices = (data?.documents || []).filter(
      (d: any) => d.doc_type === "invoice" && d.status !== "cancelled",
    );
    return {
      invoiced: invoices.reduce((sum: any, d: any) => sum + num(d.total), 0),
      received: invoices.reduce((sum: any, d: any) => sum + num(d.amount_paid), 0),
      outstanding: invoices.reduce(
        (sum: any, d: any) =>
          sum + balanceOf(d),
        0,
      ),
    };
  }, [data]);

  const exportCsv = () => {
    const csv = toCsv(rows, [
      { label: "Number", value: (r: any) => r.doc.doc_number },
      { label: "Type", value: (r: any) => docTypeLabel(r.doc.doc_type) },
      { label: "Client", value: (r: any) => r.client?.name || "" },
      { label: "Client ID", value: (r: any) => r.client?.client_code || "" },
      { label: "Issue date", value: (r: any) => fmtDate(r.doc.issue_date) },
      { label: "Total (₹)", value: (r: any) => num(r.doc.total).toFixed(2) },
      {
        label: "Received (₹)",
        value: (r: any) => num(r.doc.amount_paid).toFixed(2),
      },
      { label: "Balance (₹)", value: (r: any) => num(r.doc.balance_due).toFixed(2) },
      { label: "Status", value: (r: any) => r.doc.status },
    ]);
    downloadCsv(`documents-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  };

  if (isLoading || settingsLoading)
    return <Skeleton className="h-[420px] rounded-xl" />;

  return (
    <div>
      <PageHeader
        title="Document studio"
        description="Quotations, invoices, receipts, agreements and proposals — generated from your live client data."
      >
        <Button
          variant="outline"
          size="sm"
          onClick={exportCsv}
          disabled={!rows.length}
        >
          <Download className="mr-1.5 h-3.5 w-3.5" /> Export CSV
        </Button>
        <Button asChild size="sm">
          <Link to="/documents/new">
            <Plus className="mr-1.5 h-3.5 w-3.5" /> New document
          </Link>
        </Button>
      </PageHeader>

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Invoiced"
          value={inr(totals.invoiced)}
          hint="All issued invoices"
          tone="violet"
        />
        <StatCard
          label="Received against invoices"
          value={inr(totals.received)}
          hint="Recorded payments only"
          tone="emerald"
        />
        <StatCard
          label="Outstanding"
          value={inr(totals.outstanding)}
          hint="Unpaid invoice balance"
          tone="amber"
        />
      </div>

      <DataToolbar>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by number, title or client"
            className="h-9 bg-white pl-9 text-[13px]"
          />
        </div>
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="h-9 w-[170px] bg-white text-[12.5px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {DOC_TYPES.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-9 w-[150px] bg-white text-[12.5px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {Object.entries(DOC_STATUS).map(([value, meta]) => (
              <SelectItem key={value} value={value}>
                {meta.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </DataToolbar>

      {rows.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={
            data?.documents?.length
              ? "No documents match these filters"
              : "No documents yet"
          }
          description={
            data?.documents?.length
              ? "Try another type or status."
              : `Create your first ${settings.quotation_prefix}-series quotation or invoice.`
          }
          action={
            <Button asChild size="sm">
              <Link to="/documents/new">Create document</Link>
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
                    Document
                  </TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Client
                  </TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Issued
                  </TableHead>
                  <TableHead className="text-right text-[11px] uppercase tracking-wide text-muted-foreground">
                    Total
                  </TableHead>
                  <TableHead className="text-right text-[11px] uppercase tracking-wide text-muted-foreground">
                    Received
                  </TableHead>
                  <TableHead className="text-right text-[11px] uppercase tracking-wide text-muted-foreground">
                    Balance
                  </TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Status
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(({ doc, client }: any) => (
                  <TableRow key={doc.id} className="hover:bg-slate-50/60">
                    <TableCell>
                      <Link
                        to="/documents/$documentId"
                        params={{ documentId: doc.id }}
                        className="block text-[13px] font-semibold hover:text-primary"
                      >
                        {doc.doc_number}
                      </Link>
                      <p className="text-[11px] text-muted-foreground">
                        {docTypeLabel(doc.doc_type)}
                      </p>
                    </TableCell>
                    <TableCell className="text-[12.5px]">
                      <ClientRef client={client} />
                    </TableCell>
                    <TableCell className="text-[12.5px] text-muted-foreground">
                      {fmtDate(doc.issue_date)}
                    </TableCell>
                    <TableCell className="text-right text-[12.5px] tabular-nums">
                      {inr(doc.total)}
                    </TableCell>
                    <TableCell className="text-right text-[12.5px] tabular-nums text-emerald-700">
                      {inr(doc.amount_paid)}
                    </TableCell>
                    <TableCell
                      className={`text-right text-[12.5px] font-medium tabular-nums ${num(doc.balance_due) > 0 ? "text-amber-700" : "text-muted-foreground"}`}
                    >
                      {inr(doc.balance_due)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={doc.status} map={DOC_STATUS} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}
