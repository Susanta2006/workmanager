import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Building2,
  FileText,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Wallet,
} from "lucide-react";
import { fetchAll, fetchOne } from "@/lib/db";
import { CLIENT_STATUS, PROJECT_STATUS } from "@/lib/constants";
import { DOC_STATUS, docTypeLabel } from "@/lib/doc-types";
import { PAYMENT_STATUS } from "@/lib/constants";
import { fmtDate, fmtDateTime, inr, num } from "@/lib/format";
import StatCard from "@/components/common/StatCard";
import StatusBadge from "@/components/common/StatusBadge";
import EmptyState from "@/components/common/EmptyState";
import ClientDialog from "@/components/clients/ClientDialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authed/clients/$clientId")({
  head: () => ({ meta: [{ title: "Client · WorkManager" }] }),
  component: ClientDetailPage,
});

function ClientDetailPage() {
  const { clientId } = Route.useParams();
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["client-detail", clientId],
    queryFn: async () => {
      const [client, projects, documents, payments, expenses, activity] =
        await Promise.all([
          fetchOne("Client", clientId),
          fetchAll("Project", { client_id: clientId }),
          fetchAll("Document", { client_id: clientId }),
          fetchAll("Payment", { client_id: clientId }),
          fetchAll("Expense", { client_id: clientId }),
          fetchAll("ActivityLog", null),
        ]);
      return { client, projects, documents, payments, expenses, activity };
    },
  });

  const summary = useMemo(() => {
    const documents = data?.documents || [];
    const payments = data?.payments || [];
    const projects = data?.projects || [];
    const invoices = documents.filter(
      (d: any) => d.doc_type === "invoice" && d.status !== "cancelled",
    );
    return {
      projectValue: projects.reduce((sum: any, p: any) => sum + num(p.project_value), 0),
      invoiced: invoices.reduce((sum: any, d: any) => sum + num(d.total), 0),
      received: payments.reduce(
        (sum: any, p: any) =>
          p.status === "received"
            ? sum + num(p.amount)
            : p.status === "refunded"
              ? sum - num(p.amount)
              : sum,
        0,
      ),
      outstanding: invoices.reduce(
        (sum: any, d: any) =>
          sum + num(d.balance_due || num(d.total) - num(d.amount_paid)),
        0,
      ),
    };
  }, [data]);

  const clientActivity = useMemo(() => {
    const client = data?.client;
    if (!client) return [];
    return (data.activity || [])
      .filter(
        (log: any) =>
          log.entity_id === client.id ||
          (log.entity_label && log.entity_label === client.name),
      )
      .slice(0, 30);
  }, [data]);

  if (isLoading) return <Skeleton className="h-[500px] rounded-xl" />;

  if (!data?.client) {
    return (
      <EmptyState
        icon={Building2}
        title="Client not found"
        description="This client may have been deleted, or you don't have access to it."
        action={
          <Button asChild variant="outline" size="sm">
            <Link to="/clients">
              <ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> Back to clients
            </Link>
          </Button>
        }
      />
    );
  }

  const client = data.client;

  return (
    <div>
      <Link
        to="/clients"
        className="mb-3 inline-flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> All clients
      </Link>

      <div className="surface mb-4 flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-violet))] font-heading text-sm font-bold text-white">
            {String(client.name || "?")
              .slice(0, 2)
              .toUpperCase()}
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-heading text-[20px] font-bold leading-tight">
                {client.name}
              </h1>
              <StatusBadge status={client.status} map={CLIENT_STATUS} />
              <Badge
                variant="outline"
                className="h-5 text-[10px] font-normal text-muted-foreground"
              >
                {client.client_code || "—"}
              </Badge>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
              {client.email && (
                <span className="inline-flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5" /> {client.email}
                </span>
              )}
              {client.phone && (
                <span className="inline-flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5" /> {client.phone}
                </span>
              )}
              {client.website && (
                <a
                  href={client.website}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary hover:underline"
                >
                  {client.website.replace(/^https?:\/\//, "")}
                </a>
              )}
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" />{" "}
                {client.client_type === "individual"
                  ? "Individual"
                  : "Business"}
              </span>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link to="/projects" search={{ client: client.id, new: true }}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Project
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link to="/tasks" search={{ client: client.id, new: true }}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Task
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link to="/payments" search={{ client: client.id, new: true }}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Payment
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link to="/expenses" search={{ client: client.id, new: true }}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Expense
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link to="/documents/new" search={{ client: client.id }}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Document
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Project value"
          value={inr(summary.projectValue)}
          hint={`${data.projects.length} project(s)`}
          icon={Building2}
          tone="blue"
        />
        <StatCard
          label="Invoiced"
          value={inr(summary.invoiced)}
          hint="Issued invoices"
          icon={FileText}
          tone="violet"
        />
        <StatCard
          label="Received"
          value={inr(summary.received)}
          hint="Net of refunds"
          icon={Wallet}
          tone="emerald"
        />
        <StatCard
          label="Outstanding"
          value={inr(summary.outstanding)}
          hint="Open invoice balances"
          icon={Wallet}
          tone="amber"
        />
      </div>

      <Tabs defaultValue="overview" className="mt-4">
        <TabsList className="mb-3 flex h-auto w-full flex-wrap justify-start gap-1 bg-transparent p-0">
          {[
            "overview",
            "projects",
            "documents",
            "payments",
            "expenses",
            "notes",
            "activity",
          ].map((tab) => (
            <TabsTrigger
              key={tab}
              value={tab}
              className="rounded-lg border border-transparent px-3 py-1.5 text-[12.5px] capitalize data-[state=active]:border-border data-[state=active]:bg-card data-[state=active]:shadow-sm"
            >
              {tab}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="surface p-4">
              <h2 className="mb-3 font-heading text-[14px] font-semibold">
                Contact details
              </h2>
              <dl className="grid grid-cols-2 gap-3 text-[12.5px]">
                <Info label="Contact person" value={client.contact_person} />
                <Info label="Client type" value={client.client_type} />
                <Info label="Email" value={client.email} />
                <Info label="Phone" value={client.phone} />
                <Info label="WhatsApp" value={client.whatsapp} />
                <Info label="Website" value={client.website} />
                <Info
                  label="Source"
                  value={String(client.source || "").replace(/_/g, " ")}
                />
                <Info label="Tax ID" value={client.tax_id} />
                <Info label="Created" value={fmtDate(client.created_date)} />
                <Info label="Updated" value={fmtDate(client.updated_date)} />
              </dl>
              {(client.tags || []).length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {client.tags.map((tag: any) => (
                    <Badge
                      key={tag}
                      variant="secondary"
                      className="text-[10px] font-normal"
                    >
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            <div className="surface p-4">
              <h2 className="mb-3 font-heading text-[14px] font-semibold">
                Addresses
              </h2>
              <div className="grid gap-3 text-[12.5px]">
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Billing address
                  </p>
                  <p className="mt-0.5 whitespace-pre-line">
                    {client.billing_address || "—"}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Business address
                  </p>
                  <p className="mt-0.5 whitespace-pre-line">
                    {client.business_address || "—"}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="projects">
          {data.projects.length === 0 ? (
            <EmptyState
              title="No projects for this client"
              description="Create a project to track the engagement value and deadlines."
              action={
                <Button asChild size="sm">
                  <Link to="/projects">Go to projects</Link>
                </Button>
              }
            />
          ) : (
            <div className="surface divide-y divide-border/70">
              {data.projects.map((project: any) => (
                <Link
                  key={project.id}
                  to="/projects/$projectId"
                  params={{ projectId: project.id }}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-slate-50/70"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium">
                      {project.title}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {project.project_code} · due {fmtDate(project.deadline)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[12.5px] font-medium tabular-nums">
                      {inr(project.project_value)}
                    </span>
                    <StatusBadge status={project.status} map={PROJECT_STATUS} />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="documents">
          {data.documents.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No documents yet"
              description="Quotations, invoices and agreements for this client will appear here."
              action={
                <Button asChild size="sm">
                  <Link to="/documents/new" search={{ client: client.id }}>
                    Create document
                  </Link>
                </Button>
              }
            />
          ) : (
            <div className="surface divide-y divide-border/70">
              {data.documents.map((doc: any) => (
                <Link
                  key={doc.id}
                  to="/documents/$documentId"
                  params={{ documentId: doc.id }}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-slate-50/70"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium">
                      {doc.doc_number}{" "}
                      <span className="font-normal text-muted-foreground">
                        · {docTypeLabel(doc.doc_type)}
                      </span>
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {fmtDate(doc.issue_date)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[12.5px] font-medium tabular-nums">
                      {inr(doc.total)}
                    </span>
                    <StatusBadge status={doc.status} map={DOC_STATUS} />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="payments">
          {data.payments.length === 0 ? (
            <EmptyState
              title="No payments recorded"
              description="Payments received from this client will be listed here."
            />
          ) : (
            <div className="surface divide-y divide-border/70">
              {data.payments.map((payment: any) => (
                <div
                  key={payment.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
                >
                  <div>
                    <p className="text-[13px] font-medium">
                      {payment.payment_code}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {fmtDate(payment.payment_date)} ·{" "}
                      {String(payment.method || "").replace(/_/g, " ")}
                      {payment.reference ? ` · ${payment.reference}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`text-[12.5px] font-semibold tabular-nums ${payment.status === "refunded" ? "text-rose-600" : "text-emerald-700"}`}
                    >
                      {payment.status === "refunded" ? "−" : ""}
                      {inr(payment.amount)}
                    </span>
                    <StatusBadge status={payment.status} map={PAYMENT_STATUS} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="expenses">
          {data.expenses.length === 0 ? (
            <EmptyState
              title="No client-linked expenses"
              description="Costs tagged to this client will appear here."
            />
          ) : (
            <div className="surface divide-y divide-border/70">
              {data.expenses.map((expense: any) => (
                <div
                  key={expense.id}
                  className="flex items-center justify-between gap-2 px-4 py-3"
                >
                  <div>
                    <p className="text-[13px] font-medium">{expense.title}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {fmtDate(expense.expense_date)} ·{" "}
                      {String(expense.category || "").replace(/_/g, " ")}
                    </p>
                  </div>
                  <span className="text-[12.5px] font-medium tabular-nums text-rose-600">
                    {inr(expense.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="notes">
          <div className="surface p-4">
            <p className="whitespace-pre-line text-[13px] leading-relaxed text-slate-700">
              {client.notes || "No notes yet."}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => setEditOpen(true)}
            >
              <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit notes
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="activity">
          {clientActivity.length === 0 ? (
            <EmptyState
              title="No activity recorded"
              description="Client updates, documents and payments will be logged here."
            />
          ) : (
            <div className="surface divide-y divide-border/70">
              {clientActivity.map((log: any) => (
                <div key={log.id} className="px-4 py-3">
                  <p className="text-[12.5px]">
                    <span className="font-medium">{log.action}</span>
                    {log.details ? (
                      <span className="text-muted-foreground">
                        {" "}
                        · {log.details}
                      </span>
                    ) : null}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {log.actor_name} · {fmtDateTime(log.created_date)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <ClientDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        client={client}
        onSaved={() =>
          queryClient.invalidateQueries({
            queryKey: ["client-detail", clientId],
          })
        }
      />
    </div>
  );
}

function Info({ label, value }: any) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 capitalize">{value || "—"}</dd>
    </div>
  );
}
