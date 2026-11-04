import ClientRef from "@/components/common/ClientRef";
import { useEffect, useMemo, useRef, useState } from "react";
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
import { fetchAll, fetchOne, logActivity, syncPaymentBalances } from "@/lib/db";
import { createDocument } from "@/lib/server-fns";
import { useAuth } from "@/lib/AuthContext";
import { usePermissions } from "@/lib/permissions";
import { useOrgSettings } from "@/lib/org-settings";
import { refreshWorkspaceData } from "@/lib/sync";
import { DOC_STATUS, computeTotals, docTypeLabel } from "@/lib/doc-types";
import { buildLedger, documentFinancials, invoiceSnapshot, receiptSnapshot, resolveStatus } from "@/lib/doc-finance";
import { downloadDocumentPdf, pdfFilename } from "@/lib/pdf-export";
import { fmtDate, inr, num } from "@/lib/format";
import DocumentForm from "@/components/documents/DocumentForm";
import DocumentPaper from "@/components/documents/DocumentPaper";
import FitToWidth from "@/components/documents/FitToWidth";
import PaymentDialog from "@/components/payments/PaymentDialog";
import StatusBadge from "@/components/common/StatusBadge";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchClients } from "@/lib/clients";
import { PAYMENT_METHOD_LABELS } from "@/lib/constants";

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
  const paperRef = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [payOpen, setPayOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["document-detail", documentId],
    queryFn: async () => {
      const [document, payments, documents, clients, projects] = await Promise.all([
        fetchOne("Document", documentId),
        fetchAll("Payment", null),
        fetchAll("Document", null),
        fetchClients(),
        fetchAll("Project", null),
      ]);
      return { document, payments, documents, clients, projects };
    },
  });

  useEffect(() => {
    if (data?.document) setForm({ ...data.document, items: data.document.items || [] });
  }, [data?.document]);

  const doc = data?.document;
  const client = data?.clients.find((c: any) => c.id === doc?.client_id);
  const project = (data?.projects || []).find((p: any) => p.id === doc?.project_id);
  const ledger = useMemo(
    () => buildLedger(data?.payments || [], data?.documents || []),
    [data?.payments, data?.documents],
  );
  // Live figures from the payment ledger. The same numbers are printed and used for balance checks.
  const fin = doc ? documentFinancials(doc, project, ledger) : null;
  const docPayments = fin ? fin.rows.filter((p: any) => ["received", "refunded"].includes(p.status)) : [];

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["document-detail", documentId] });

  const save = async () => {
    if (!form.client_id) {
      setError("Choose a client from the list.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const totals = computeTotals(form.items, form.tax_rate);
      // Project-billed invoices take their total from the project and are not tax-adjusted.
      const billedProject = (data?.projects || []).find((p: any) => p.id === form.project_id);
      if (doc.doc_type === "quotation") {
        setError("A quotation is the fixed project price and cannot be edited.");
        setSaving(false);
        return;
      }
      // Invoices freeze their project figures when issued. Later edits change only the lines.
      const billed = Boolean(billedProject && num(billedProject.project_value) > 0);
      const frozen = billed
        ? form.project_billing?.paid_before !== undefined && form.project_billing?.paid_before !== null
          ? form.project_billing
          : invoiceSnapshot(ledger, billedProject, form.issue_date)
        : form.project_billing || null;
      const draft = { ...form, project_billing: frozen };
      const live = documentFinancials(draft, billedProject, ledger);
      await backend.entities.Document.update(documentId, {
        ...form,
        tax_rate: Number(form.tax_rate || 0),
        ...totals,
        total: live.toBePaid,
        amount_paid: live.received,
        balance_due: live.dueNow,
        project_billing: frozen,
        status: resolveStatus(draft, live),
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
      refreshWorkspaceData(queryClient);
    } catch (err: any) {
      setError(err?.message || "Could not update this document.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      const linked = (data?.payments || []).filter((p: any) => p.document_id === documentId);
      // Older entries may have no project stored. Record it before the document is gone so the project total stays correct.
      for (const payment of linked) {
        if (!payment.project_id && doc?.project_id) {
          await backend.entities.Payment.update(payment.id, { project_id: doc.project_id });
          payment.project_id = doc.project_id;
        }
      }
      // Deleting a receipt frees its payment, so the payment can have a new receipt.
      for (const payment of (data?.payments || []).filter((p: any) => p.receipt_id === documentId)) {
        await backend.entities.Payment.update(payment.id, { receipt_id: "", receipt_number: "" });
      }
      await backend.entities.Document.delete(documentId);
      await logActivity({
        user,
        action: "Document deleted",
        entityType: "Document",
        entityId: documentId,
        label: doc?.doc_number,
      });
      // Payments recorded against a deleted document are kept on the ledger, so project balances stay correct.
      if (linked.length) await syncPaymentBalances(...linked);
      toast.success("Document deleted");
      refreshWorkspaceData(queryClient);
      navigate({ to: "/documents" });
    } catch (err: any) {
      toast.error(err?.message || "Could not delete this document.");
    } finally {
      setBusy(false);
    }
  };

  const downloadPdf = async () => {
    setPdfBusy(true);
    try {
      await downloadDocumentPdf(paperRef.current as HTMLElement, pdfFilename(doc.doc_number));
    } catch (err: any) {
      toast.error(err?.message || "Could not create the PDF. Try Print instead.");
    } finally {
      setPdfBusy(false);
    }
  };

  const createReceipt = async (payment: any) => {
    if (payment.receipt_id) {
      toast.info(`A receipt (${payment.receipt_number}) already exists for this payment.`);
      navigate({ to: "/documents/$documentId", params: { documentId: payment.receipt_id } });
      return;
    }
    if (!payment.document_id) {
      toast.error("Attach this payment to an invoice before creating a receipt.");
      return;
    }
    try {
      const receiptProjectId = payment.project_id || doc.project_id || "";
      const receiptProject = (data?.projects || []).find((p: any) => p.id === receiptProjectId);
      const items = [
        {
          description: `Payment received against ${doc.doc_number} · ${fmtDate(payment.payment_date)}${payment.method ? ` · ${PAYMENT_METHOD_LABELS[payment.method] || payment.method}` : ""}`,
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
            payment_id: payment.id,
            client_id: doc.client_id,
            client_name: doc.client_name || client?.name || "",
            project_id: receiptProjectId,
            project_name: doc.project_name || receiptProject?.title || project?.title || "",
            project_billing: receiptProject && num(receiptProject.project_value) > 0 ? receiptSnapshot(ledger, receiptProject, payment) : null,
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
      // Record the receipt on the payment, then refresh the invoice and every screen that shows it.
      await backend.entities.Payment.update(payment.id, {
        receipt_id: created.id,
        receipt_number: created.doc_number,
      });
      await syncPaymentBalances(payment);
      await refreshWorkspaceData(queryClient);
      await logActivity({
        user,
        action: "Receipt generated",
        entityType: "Document",
        entityId: created.id,
        label: created.doc_number,
      });
      toast.success(`Receipt ${created.doc_number} created`);
      navigate({ to: "/documents/$documentId", params: { documentId: created.id } });
    } catch (err: any) {
      toast.error(err?.message || "Could not generate the receipt.");
    }
  };

  if (isLoading || !doc || !fin) return <Skeleton className="h-[600px] rounded-xl" />;

  const balance = fin.balance;
  const stillToCollect = fin.dueNow;

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
              <h1 className="font-heading text-[19px] font-bold leading-tight">{doc.doc_number}</h1>
              <StatusBadge status={doc.status} map={DOC_STATUS} />
              <span className="text-[12px] text-muted-foreground">{docTypeLabel(doc.doc_type)}</span>
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
              · issued {fmtDate(doc.issue_date)}
              {fin.billed && doc.doc_type === "invoice" ? (
                <>
                  {" "}· to be paid {inr(fin.toBePaid)} · actual price {inr(fin.actual)} · already paid {inr(fin.paidBefore)} · left to pay{" "}
                  <strong className={balance > 0 ? "text-amber-700" : "text-emerald-700"}>
                    {inr(balance)}
                  </strong>
                </>
              ) : (
                <>
                  {" "}· total {inr(fin.total)} · received {inr(fin.received)} · balance{" "}
                  <strong className={balance > 0 ? "text-amber-700" : "text-emerald-700"}>
                    {inr(balance)}
                  </strong>
                </>
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={downloadPdf} disabled={pdfBusy}>
              <FileDown className="mr-1.5 h-3.5 w-3.5" />{" "}
              {pdfBusy ? "Preparing PDF…" : "Download PDF"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="mr-1.5 h-3.5 w-3.5" /> Print
            </Button>
            {doc.doc_type === "invoice" && (
              <Button variant="outline" size="sm" onClick={() => setPayOpen(true)}>
                <Wallet className="mr-1.5 h-3.5 w-3.5" /> Record payment
              </Button>
            )}
            {doc.doc_type !== "quotation" && (
            <Button
              variant={editing ? "secondary" : "outline"}
              size="sm"
              onClick={() => setEditing((value) => !value)}
            >
              <Pencil className="mr-1.5 h-3.5 w-3.5" /> {editing ? "Close editor" : "Edit"}
            </Button>
            )}
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
              ledger={ledger}
              onRecordPayment={() => setPayOpen(true)}
            />
            <div className="mt-3 flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setEditing(false);
                  setForm({ ...doc, items: doc.items || [] });
                }}
              >
                Discard
              </Button>
              <Button size="sm" onClick={save} disabled={saving}>
                <Save className="mr-1.5 h-3.5 w-3.5" /> {saving ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </div>
        )}
      </div>

      <FitToWidth className="rounded-xl bg-slate-100 p-3 print:bg-white print:p-0">
        <div ref={paperRef}>
          <DocumentPaper
            doc={doc}
            client={client}
            project={project}
            settings={settings}
            ledger={ledger}
          />
        </div>
      </FitToWidth>

      {docPayments.length > 0 && (
        <div className="surface mt-4 p-4" data-no-print>
          <h2 className="mb-3 font-heading text-[14px] font-semibold">
            Payments against this document
          </h2>
          <ul className="divide-y divide-border/70">
            {docPayments.map((payment: any) => (
              <li key={payment.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div>
                  <p className="text-[12.5px] font-medium">
                    {payment.payment_code} · {inr(payment.amount)}
                    {payment.status === "refunded" ? " (refund)" : ""}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {fmtDate(payment.payment_date)} ·{" "}
                    {PAYMENT_METHOD_LABELS[payment.method] || String(payment.method || "").replace(/_/g, " ")}{" "}
                    · {payment.status}
                  </p>
                </div>
                {doc.doc_type === "invoice" && payment.status === "received" && (
                  <Button variant="ghost" size="sm" onClick={() => createReceipt(payment)}>
                    <Receipt className="mr-1.5 h-3.5 w-3.5" />
                    {payment.receipt_number ? `View ${payment.receipt_number}` : "Create receipt"}
                  </Button>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11.5px] text-muted-foreground">
            Received on this document {inr(fin.received)} · still to collect here {inr(stillToCollect)}
          </p>
        </div>
      )}

      <PaymentDialog
        open={payOpen}
        onOpenChange={setPayOpen}
        clients={data.clients}
        projects={data.projects}
        documents={data.documents}
        defaults={{
          client_id: doc.client_id,
          project_id: doc.project_id,
          document_id: doc.id,
          amount: stillToCollect,
        }}
        onSaved={refresh}
      />

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this document?"
        description="This permanently deletes the document and any receipts generated from it. Payments already recorded stay on the payment ledger and the project balance is kept correct. Activity logs are retained."
        confirmLabel="Delete document"
        destructive
        onConfirm={remove}
        busy={busy}
      />
    </div>
  );
}
