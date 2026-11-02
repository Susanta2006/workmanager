import ClientRef from "@/components/common/ClientRef";
import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  FileDown,
  Pencil,
  Printer,
  Receipt,
  Save,
  Trash2,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { backend } from "@/api/backend";
import { fetchAll, fetchOne, logActivity } from "@/lib/db";
import { createDocument } from "@/lib/server-fns";
import { useAuth } from "@/lib/AuthContext";
import { usePermissions } from "@/lib/permissions";
import { useOrgSettings } from "@/lib/org-settings";
import { refreshWorkspaceData } from "@/lib/sync";
import { DOC_STATUS, computeTotals, docTypeLabel } from "@/lib/doc-types";
import { fmtDate, inr, num } from "@/lib/format";
import DocumentForm from "@/components/documents/DocumentForm";
import DocumentPaper from "@/components/documents/DocumentPaper";
import PaymentDialog from "@/components/payments/PaymentDialog";
import StatusBadge from "@/components/common/StatusBadge";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchClients } from "@/lib/clients";

export const Route = createFileRoute("/_authed/documents/$documentId")({
  head: () => ({ meta: [{ title: "Document · WorkManager" }] }),
  component: DocumentDetailPage,
});

function DocumentDetailPage() {
  const { documentId } = Route.useParams();
  const { user } = useAuth();
  const { canDelete } = usePermissions();
  const navigate = useNavigate();
  const { settings } = useOrgSettings();
  const createDoc = useServerFn(createDocument);
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [payOpen, setPayOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["document-detail", documentId],
    queryFn: async () => {
      const [document, client, payments, clients, projects] = await Promise.all(
        [
          fetchOne("Document", documentId),
          null,
          fetchAll("Payment", { document_id: documentId }),
          fetchClients(),
          fetchAll("Project", null),
        ],
      );
      const doc = document;
      return {
        document: doc,
        clientRecord: client || clients.find((c: any) => c.id === doc?.client_id),
        payments,
        clients,
        projects,
      };
    },
  });

  useEffect(() => {
    if (data?.document)
      setForm({ ...data.document, items: data.document.items || [] });
  }, [data?.document]);

  const doc = data?.document;
  const client = data?.clientRecord;
  const project = (data?.projects || []).find((p: any) => p.id === doc?.project_id);


  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: ["document-detail", documentId],
    });

  const save = async () => {
    if (!form.client_id) {
      setError("Choose a client from the list.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const computed = computeTotals(form.items, form.tax_rate);
      await backend.entities.Document.update(documentId, {
        ...form,
        tax_rate: Number(form.tax_rate || 0),
        ...computed,
        balance_due: Math.max(
          0,
          computed.total - Number(form.amount_paid || 0),
        ),
      });
      await logActivity({
        user,
        action: "Document edited",
        entityType: "Document",
        entityId: documentId,
        label: form.doc_number,
      });
      toast.success("Document updated");
      setEditing(false);
      refresh();
    } catch (err: any) {
      setError(err?.message || "Could not update this document.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await backend.entities.Document.delete(documentId);
      await logActivity({
        user,
        action: "Document deleted",
        entityType: "Document",
        entityId: documentId,
        label: doc?.doc_number,
      });
      toast.success("Document deleted");
      refreshWorkspaceData(queryClient);
      navigate({ to: "/documents" });
    } catch (err: any) {
      toast.error(err?.message || "Could not delete this document.");
    } finally {
      setBusy(false);
    }
  };

  const createReceipt = async (payment: any) => {
    try {
      const items = [
        {
          description: `Payment received against ${doc.doc_number}`,
          quantity: 1,
          rate: num(payment.amount),
          discount: 0,
        },
      ];
      const computed = computeTotals(items, 0);
      const created = await createDoc({
        data: {
          doc: {
            doc_type: "receipt",
            title: `Payment receipt · ${doc.doc_number}`,
            source_document_id: doc.id,
            client_id: doc.client_id,
            client_name: doc.client_name || client?.name || "",
            project_id: doc.project_id,
            project_name: doc.project_name || project?.title || "",
            issue_date: payment.payment_date,
            items,
            tax_rate: 0,
            ...computed,
            amount_paid: computed.total,
            balance_due: 0,
            status: "paid",
            notes: `Against ${doc.doc_number}${payment.reference ? ` · ref ${payment.reference}` : ""}`,
            terms: "",
            payment_instructions: "",
            currency: "INR",
          },
        },
      });
      await logActivity({
        user,
        action: "Receipt generated",
        entityType: "Document",
        entityId: created.id,
        label: created.doc_number,
      });
      toast.success(`Receipt ${created.doc_number} created`);
      window.location.assign(`/documents/${created.id}`);
    } catch (err: any) {
      toast.error(err?.message || "Could not generate the receipt.");
    }
  };

  if (isLoading || !doc) return <Skeleton className="h-[600px] rounded-xl" />;

  return (
    <div>
      <div data-no-print>
        <Link
          to="/documents"
          className="mb-3 inline-flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> All documents
        </Link>

        <div className="surface mb-4 flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-heading text-[19px] font-bold leading-tight">
                {doc.doc_number}
              </h1>
              <StatusBadge status={doc.status} map={DOC_STATUS} />
              <span className="text-[12px] text-muted-foreground">
                {docTypeLabel(doc.doc_type)}
              </span>
            </div>
            <p className="mt-1 text-[12.5px] text-muted-foreground">
              {client ? (
                <Link
                  to="/clients/$clientId"
                  params={{ clientId: client.id }}
                  className="text-primary hover:underline"
                >
                  <ClientRef client={client} />
                </Link>
              ) : (
                doc.client_name || "No client"
              )}{" "}
              · issued {fmtDate(doc.issue_date)} · total {inr(doc.total)} ·
              balance{" "}
              <strong
                className={
                  num(doc.balance_due) > 0
                    ? "text-amber-700"
                    : "text-emerald-700"
                }
              >
                {inr(doc.balance_due)}
              </strong>
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <FileDown className="mr-1.5 h-3.5 w-3.5" /> Download / print PDF
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="mr-1.5 h-3.5 w-3.5" /> Print
            </Button>
            {["invoice", "quotation"].includes(doc.doc_type) && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPayOpen(true)}
              >
                <Wallet className="mr-1.5 h-3.5 w-3.5" /> Record payment
              </Button>
            )}
            <Button
              variant={editing ? "secondary" : "outline"}
              size="sm"
              onClick={() => setEditing((value) => !value)}
            >
              <Pencil className="mr-1.5 h-3.5 w-3.5" />{" "}
              {editing ? "Close editor" : "Edit"}
            </Button>
            {canDelete && (
              <Button
                variant="ghost"
                size="sm"
                className="text-rose-600 hover:text-rose-700"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>

        {editing && form && (
          <div className="surface mb-4 p-4">
            {error && (
              <p className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700">
                {error}
              </p>
            )}
            <DocumentForm
              form={form}
              setForm={setForm}
              clients={data.clients}
              projects={data.projects}
              settings={settings}
            />
            <div className="mt-3 flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setEditing(false);
                  setForm({ ...doc });
                }}
              >
                Discard
              </Button>
              <Button size="sm" onClick={save} disabled={saving}>
                <Save className="mr-1.5 h-3.5 w-3.5" />{" "}
                {saving ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl bg-slate-100 p-3 print:bg-white print:p-0">
        <DocumentPaper
          doc={doc}
          client={client}
          project={project}
          settings={settings}
        />
      </div>

      {data.payments.length > 0 && (
        <div className="surface mt-4 p-4" data-no-print>
          <h2 className="mb-3 font-heading text-[14px] font-semibold">
            Payments against this document
          </h2>
          <ul className="divide-y divide-border/70">
            {data.payments.map((payment: any) => (
              <li
                key={payment.id}
                className="flex flex-wrap items-center justify-between gap-2 py-2"
              >
                <div>
                  <p className="text-[12.5px] font-medium">
                    {payment.payment_code} · {inr(payment.amount)}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {fmtDate(payment.payment_date)} ·{" "}
                    {String(payment.method || "").replace(/_/g, " ")} ·{" "}
                    {payment.status}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => createReceipt(payment)}
                >
                  <Receipt className="mr-1.5 h-3.5 w-3.5" /> Receipt
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <PaymentDialog
        open={payOpen}
        onOpenChange={setPayOpen}
        clients={data.clients}
        projects={data.projects}
        documents={[doc]}
        defaults={{
          client_id: doc.client_id,
          project_id: doc.project_id,
          document_id: doc.id,
          amount: num(doc.balance_due),
        }}
        onSaved={refresh}
      />

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this document?"
        description="This permanently deletes the document, payments recorded against it and any receipts generated from it. Activity logs are retained."
        confirmLabel="Delete document"
        destructive
        onConfirm={remove}
        busy={busy}
      />
    </div>
  );
}
