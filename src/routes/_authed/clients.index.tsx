import { refreshWorkspaceData } from "@/lib/sync";
import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  Download,
  Pencil,
  Plus,
  Search,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { backend } from "@/api/backend";
import { fetchAll, logActivity } from "@/lib/db";
import { useAuth } from "@/lib/AuthContext";
import { usePermissions } from "@/lib/permissions";
import { CLIENT_STATUS, CLIENT_TYPES } from "@/lib/constants";
import { downloadCsv, fmtDate, inr, num, toCsv } from "@/lib/format";
import PageHeader from "@/components/common/PageHeader";
import DataToolbar from "@/components/common/DataToolbar";
import EmptyState from "@/components/common/EmptyState";
import StatusBadge from "@/components/common/StatusBadge";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import ClientDialog from "@/components/clients/ClientDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { fetchClients } from "@/lib/clients";
import type { ClientRow } from "@/lib/clients";

export const Route = createFileRoute("/_authed/clients/")({
  head: () => ({ meta: [{ title: "Clients · WorkManager" }] }),
  component: ClientsPage,
});

const PAGE_SIZE = 10;

function ClientsPage() {
  const { user } = useAuth();
  const { canDelete } = usePermissions();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [type, setType] = useState("all");
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<{ open: boolean; client: ClientRow | null }>({ open: false, client: null });
  const [archiving, setArchiving] = useState<any>(null);
  const [deleting, setDeleting] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["clients-page"],
    queryFn: async () => {
      const [clients, projects, documents, payments] = await Promise.all([
        fetchClients(),
        fetchAll("Project", null),
        fetchAll("Document", null),
        fetchAll("Payment", null),
      ]);
      return { clients, projects, documents, payments };
    },
  });

  const rows = useMemo(() => {
    const clients = data?.clients || [];
    const projects = data?.projects || [];
    const documents = data?.documents || [];
    const payments = data?.payments || [];
    const filtered = clients.filter((client: any) => {
      const haystack =
        `${client.name} ${client.email} ${client.contact_person} ${client.client_code} ${(client.tags || []).join(" ")}`.toLowerCase();
      if (search && !haystack.includes(search.toLowerCase())) return false;
      if (status !== "all" && client.status !== status) return false;
      if (type !== "all" && client.client_type !== type) return false;
      return true;
    });
    const sorted = [...filtered].sort((a: any, b: any) => {
      if (sort === "name") return String(a.name).localeCompare(String(b.name));
      if (sort === "value") return num(b.project_value) - num(a.project_value);
      return String(b.created_date).localeCompare(String(a.created_date));
    });
    return sorted.map((client) => {
      const clientProjects = projects.filter((p: any) => p.client_id === client.id);
      const clientDocs = documents.filter(
        (d: any) =>
          d.client_id === client.id &&
          d.doc_type === "invoice" &&
          d.status !== "cancelled",
      );
      const received = payments
        .filter((p: any) => p.client_id === client.id)
        .reduce(
          (sum: any, p: any) =>
            p.status === "received"
              ? sum + num(p.amount)
              : p.status === "refunded"
                ? sum - num(p.amount)
                : sum,
          0,
        );
      return {
        client,
        projects: clientProjects.length,
        outstanding: clientDocs.reduce(
          (sum: any, d: any) =>
            sum + num(d.balance_due || num(d.total) - num(d.amount_paid)),
          0,
        ),
        received,
      };
    });
  }, [data, search, status, type, sort]);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = rows.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  const exportCsv = () => {
    const csv = toCsv(rows, [
      { label: "Client code", value: (r: any) => r.client.client_code },
      { label: "Name", value: (r: any) => r.client.name },
      { label: "Type", value: (r: any) => r.client.client_type },
      { label: "Contact person", value: (r: any) => r.client.contact_person },
      { label: "Email", value: (r: any) => r.client.email },
      { label: "Phone", value: (r: any) => r.client.phone },
      { label: "Status", value: (r: any) => r.client.status },
      { label: "Projects", value: (r: any) => r.projects },
      { label: "Received (₹)", value: (r: any) => r.received.toFixed(2) },
      { label: "Outstanding (₹)", value: (r: any) => r.outstanding.toFixed(2) },
      { label: "Created", value: (r: any) => fmtDate(r.client.created_date) },
    ]);
    downloadCsv(`clients-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  };

  const archive = async () => {
    if (!archiving) return;
    setBusy(true);
    try {
      const next = archiving.status === "archived" ? "active" : "archived";
      await backend.entities.Client.update(archiving.id, { status: next });
      await logActivity({
        user,
        action: next === "archived" ? "Client archived" : "Client restored",
        entityType: "Client",
        entityId: archiving.id,
        label: archiving.name,
      });
      toast.success(
        next === "archived" ? "Client archived" : "Client restored",
      );
      setArchiving(null);
      queryClient.invalidateQueries({ queryKey: ["clients-page"] });
      refreshWorkspaceData(queryClient);
    } catch (error: any) {
      toast.error(error?.message || "Could not update this client.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await backend.entities.Client.delete(deleting.id);
      await logActivity({
        user,
        action: "Client deleted",
        entityType: "Client",
        entityId: deleting.id,
        label: deleting.name,
      });
      toast.success("Client deleted");
      setDeleting(null);
      queryClient.invalidateQueries({ queryKey: ["clients-page"] });
      refreshWorkspaceData(queryClient);
    } catch (error: any) {
      toast.error(error?.message || "Could not delete this client.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Clients"
        description="Your client CRM — leads, active clients and their financial footprint."
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
          onClick={() => setDialog({ open: true, client: null })}
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" /> New client
        </Button>
      </PageHeader>

      <DataToolbar>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Search by name, contact, email or tag"
            className="h-9 bg-white pl-9 text-[13px]"
          />
        </div>
        <Select
          value={status}
          onValueChange={(value) => {
            setStatus(value);
            setPage(1);
          }}
        >
          <SelectTrigger className="h-9 w-[140px] bg-white text-[12.5px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {Object.entries(CLIENT_STATUS).map(([value, meta]) => (
              <SelectItem key={value} value={value}>
                {meta.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={type}
          onValueChange={(value) => {
            setType(value);
            setPage(1);
          }}
        >
          <SelectTrigger className="h-9 w-[130px] bg-white text-[12.5px]">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {CLIENT_TYPES.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={setSort}>
          <SelectTrigger className="h-9 w-[150px] bg-white text-[12.5px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest first</SelectItem>
            <SelectItem value="name">Name A–Z</SelectItem>
            <SelectItem value="value">Highest value</SelectItem>
          </SelectContent>
        </Select>
      </DataToolbar>

      {isLoading ? (
        <Skeleton className="h-[420px] rounded-xl" />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Users}
          title={
            data?.clients?.length
              ? "No clients match these filters"
              : "No clients yet"
          }
          description={
            data?.clients?.length
              ? "Try clearing the search or filters."
              : "Add your first client or lead to start quoting and invoicing."
          }
          action={
            <Button
              size="sm"
              onClick={() => setDialog({ open: true, client: null })}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Add client
            </Button>
          }
        />
      ) : (
        <>
          <div className="surface overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/70">
                    <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      Client
                    </TableHead>
                    <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      Contact
                    </TableHead>
                    <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      Status
                    </TableHead>
                    <TableHead className="text-right text-[11px] uppercase tracking-wide text-muted-foreground">
                      Projects
                    </TableHead>
                    <TableHead className="text-right text-[11px] uppercase tracking-wide text-muted-foreground">
                      Received
                    </TableHead>
                    <TableHead className="text-right text-[11px] uppercase tracking-wide text-muted-foreground">
                      Outstanding
                    </TableHead>
                    <TableHead className="w-[120px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageRows.map(
                    ({ client, projects, received, outstanding }) => (
                      <TableRow
                        key={client.id}
                        className="hover:bg-slate-50/60"
                      >
                        <TableCell>
                          <Link
                            to="/clients/$clientId"
                            params={{ clientId: client.id }}
                            className="block text-[13px] font-semibold text-foreground hover:text-primary"
                          >
                            {client.name}
                          </Link>
                          <div className="mt-0.5 flex items-center gap-1.5">
                            <span className="text-[11px] text-muted-foreground">
                              {client.client_code || "—"}
                            </span>
                            {(client.tags || []).slice(0, 2).map((tag: any) => (
                              <Badge
                                key={tag}
                                variant="secondary"
                                className="h-4 px-1.5 text-[9.5px] font-normal"
                              >
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell>
                          <p className="text-[12.5px]">
                            {client.contact_person || "—"}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {client.email || client.phone || "—"}
                          </p>
                        </TableCell>
                        <TableCell>
                          <StatusBadge
                            status={client.status}
                            map={CLIENT_STATUS}
                          />
                        </TableCell>
                        <TableCell className="text-right text-[12.5px] tabular-nums">
                          {projects}
                        </TableCell>
                        <TableCell className="text-right text-[12.5px] tabular-nums text-emerald-700">
                          {inr(received)}
                        </TableCell>
                        <TableCell
                          className={`text-right text-[12.5px] font-medium tabular-nums ${outstanding > 0 ? "text-amber-700" : "text-muted-foreground"}`}
                        >
                          {inr(outstanding)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => setDialog({ open: true, client })}
                              title="Edit"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => setArchiving(client)}
                              title={
                                client.status === "archived"
                                  ? "Restore"
                                  : "Archive"
                              }
                            >
                              <Archive className="h-3.5 w-3.5" />
                            </Button>
                            {canDelete && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-rose-500 hover:text-rose-600"
                                onClick={() => setDeleting(client)}
                                title="Delete"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ),
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between text-[12px] text-muted-foreground">
            <span>
              {rows.length} client{rows.length === 1 ? "" : "s"} · page{" "}
              {currentPage} of {totalPages}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage === 1}
                onClick={() => setPage(currentPage - 1)}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage === totalPages}
                onClick={() => setPage(currentPage + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}

      <ClientDialog
        open={dialog.open}
        onOpenChange={(open: any) => setDialog((prev) => ({ ...prev, open }))}
        client={dialog.client}
        onSaved={() =>
          queryClient.invalidateQueries({ queryKey: ["clients-page"] })
        }
      />

      <ConfirmDialog
        open={!!archiving}
        onOpenChange={(open: any) => !open && setArchiving(null)}
        title={
          archiving?.status === "archived"
            ? "Restore this client?"
            : "Archive this client?"
        }
        description={
          archiving?.status === "archived"
            ? `${archiving?.name} will be marked active again.`
            : `${archiving?.name} will be archived. Their projects, documents and payments stay intact.`
        }
        confirmLabel={archiving?.status === "archived" ? "Restore" : "Archive"}
        onConfirm={archive}
        busy={busy}
      />

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open: any) => !open && setDeleting(null)}
        title="Delete this client?"
        description={`This permanently deletes ${deleting?.name || "the client"} and linked projects, milestones, tasks, documents, payments and expenses. Activity logs are retained. This cannot be undone.`}
        confirmLabel="Delete permanently"
        destructive
        onConfirm={remove}
        busy={busy}
      />
    </div>
  );
}
