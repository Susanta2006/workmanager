import { useEffect, useState } from "react";
import { toast } from "sonner";
import { backend } from "@/api/backend";
import { useAuth } from "@/lib/AuthContext";
import {
  logActivity,
  nextSequence,
  pushNotification,
  recalcDocumentPayments,
} from "@/lib/db";
import { PAYMENT_METHODS } from "@/lib/constants";
import { inr } from "@/lib/format";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  FormError,
  NumberField,
  SelectField,
  TextAreaField,
  TextField,
} from "@/components/common/FormFields";
import { clientOptions } from "@/lib/clients";

const emptyForm = {
  client_id: "",
  project_id: "",
  document_id: "",
  amount: "",
  payment_date: new Date().toISOString().slice(0, 10),
  method: "upi",
  reference: "",
  status: "received",
  notes: "",
};

// A stable empty object: a new one on every render would re-run the form reset on every keystroke.
const NO_DEFAULTS: Record<string, unknown> = {};

export default function PaymentDialog({
  open,
  onOpenChange,
  payment,
  clients = [],
  projects = [],
  documents = [],
  defaults = NO_DEFAULTS,
  onSaved,
}: any) {
  const { user } = useAuth();
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError("");
    if (payment?.id) setForm({ ...emptyForm, ...payment });
    else setForm({ ...emptyForm, ...defaults });
  }, [open, defaults, payment]);

  const set = (key: any) => (value: any) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const projectOptions = form.client_id
    ? projects.filter((p: any) => p.client_id === form.client_id)
    : projects;
  const invoiceOptions = (
    form.client_id
      ? documents.filter((d: any) => d.client_id === form.client_id)
      : documents
  ).filter((d: any) => ["invoice", "quotation"].includes(d.doc_type));
  const selectedInvoice = documents.find((d: any) => d.id === form.document_id);

  const chooseInvoice = (documentId: any) => {
    const doc = documents.find((d: any) => d.id === documentId);
    setForm((prev) => ({
      ...prev,
      document_id: documentId,
      client_id: doc?.client_id || prev.client_id,
      project_id: doc?.project_id || prev.project_id,
      amount: doc ? String(Number(doc.balance_due ?? doc.total ?? 0)) : prev.amount,
    }));
  };

  const submit = async (event: any) => {
    event.preventDefault();
    if (!form.client_id) {
      setError("Select the client this payment belongs to.");
      return;
    }
    if (!Number(form.amount)) {
      setError("Enter the amount received.");
      return;
    }
    if (form.status !== "refunded" && Number(form.amount) < 0) {
      setError(
        "A received payment cannot be negative — record a refund instead.",
      );
      return;
    }
    setSaving(true);
    setError("");
    try {
      let saved;
      if (payment?.id) {
        saved = await backend.entities.Payment.update(payment.id, {
          ...form,
          amount: Number(form.amount),
        });
        await recalcDocumentPayments(payment.document_id);
        if (saved.document_id && saved.document_id !== payment.document_id)
          await recalcDocumentPayments(saved.document_id);
      } else {
        const payment_code = await nextSequence(
          "Payment",
          "payment_code",
          "PAY",
        );
        saved = await backend.entities.Payment.create({
          ...form,
          amount: Number(form.amount),
          payment_code,
        });
        if (saved.document_id) await recalcDocumentPayments(saved.document_id);
      }
      await logActivity({
        user,
        action: payment?.id
          ? "Payment updated"
          : form.status === "refunded"
            ? "Refund recorded"
            : "Payment recorded",
        entityType: "Payment",
        entityId: saved.id,
        label: `${saved.payment_code || payment?.payment_code || ""} · ${inr(saved.amount)}`,
        details: selectedInvoice ? `Against ${selectedInvoice.doc_number}` : "",
      });
      await pushNotification({
        title:
          form.status === "refunded" ? "Refund recorded" : "Payment received",
        message: `${inr(saved.amount)} ${form.status === "refunded" ? "refunded to" : "received from"} ${clients.find((c: any) => c.id === saved.client_id)?.name || "client"}.`,
        type: "payment",
        link: "/payments",
        relatedRecordId: saved.id,
      });
      toast.success(
        payment?.id
          ? "Payment updated"
          : form.status === "refunded"
            ? "Refund recorded"
            : "Payment recorded",
      );
      onSaved?.(saved);
      onOpenChange(false);
    } catch (err: any) {
      setError(err?.message || "Could not record this payment.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-[620px] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading text-lg">
            {payment?.id ? "Edit payment entry" : "Record payment"}
          </DialogTitle>
          <DialogDescription className="text-[12.5px]">
            Payments are kept as separate ledger entries; invoice balances
            update automatically.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <FormError message={error} />
          <div className="grid gap-3 sm:grid-cols-2">
            <SelectField
              label="Client"
              value={form.client_id}
              onChange={set("client_id")}
              options={clientOptions(clients)}
              placeholder="Select a client"
            />
            <SelectField
              label="Project"
              value={form.project_id}
              onChange={set("project_id")}
              options={projectOptions.map((p: any) => ({
                value: p.id,
                label: p.title,
              }))}
              placeholder="Optional"
            />
            <SelectField
              label="Against invoice / quotation"
              value={form.document_id}
              onChange={chooseInvoice}
              options={invoiceOptions.map((d: any) => ({
                value: d.id,
                label: `${d.doc_number} · balance ${inr(d.balance_due ?? d.total)}`,
              }))}
              placeholder="Unlinked payment"
              className="sm:col-span-2"
            />
            <NumberField
              label="Amount received (₹)"
              value={form.amount}
              onChange={set("amount")}
              required
            />
            <TextField
              label="Payment date"
              type="date"
              value={form.payment_date}
              onChange={set("payment_date")}
            />
            <SelectField
              label="Method"
              value={form.method}
              onChange={set("method")}
              options={PAYMENT_METHODS}
            />
            <SelectField
              label="Entry type"
              value={form.status}
              onChange={set("status")}
              options={[
                { value: "received", label: "Payment received" },
                { value: "pending", label: "Promised / pending" },
                { value: "refunded", label: "Refund to client" },
                { value: "adjustment", label: "Adjustment" },
              ]}
            />
            <TextField
              label="Transaction reference"
              value={form.reference}
              onChange={set("reference")}
              placeholder="UPI / UTR / cheque no."
              className="sm:col-span-2"
            />
            <TextAreaField
              label="Notes"
              value={form.notes}
              onChange={set("notes")}
              rows={2}
              className="sm:col-span-2"
            />
          </div>
          {selectedInvoice && (
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-[12px] text-slate-600">
              {selectedInvoice.doc_number} · total {inr(selectedInvoice.total)}{" "}
              · already received {inr(selectedInvoice.amount_paid)} · balance{" "}
              <strong>
                {inr(selectedInvoice.balance_due ?? selectedInvoice.total)}
              </strong>
            </p>
          )}
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving
                ? "Saving…"
                : payment?.id
                  ? "Save changes"
                  : "Record payment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
