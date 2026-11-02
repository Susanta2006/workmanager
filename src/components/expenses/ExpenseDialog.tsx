import { useEffect, useState } from "react";
import { toast } from "sonner";
import { backend } from "@/api/backend";
import { useAuth } from "@/lib/AuthContext";
import { logActivity, nextSequence } from "@/lib/db";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_STATUS_OPTIONS,
  PAYMENT_METHODS,
} from "@/lib/constants";
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
  Field,
  NumberField,
  SelectField,
  TextAreaField,
  TextField,
} from "@/components/common/FormFields";
import { Input } from "@/components/ui/input";
import { clientOptions } from "@/lib/clients";

const emptyForm = {
  title: "",
  category: "software",
  amount: "",
  expense_date: new Date().toISOString().slice(0, 10),
  vendor: "",
  payment_method: "upi",
  status: "paid",
  client_id: "",
  project_id: "",
  description: "",
  notes: "",
};

// A stable empty object: a new one on every render would re-run the form reset on every keystroke.
const NO_DEFAULTS: Record<string, unknown> = {};

export default function ExpenseDialog({
  open,
  onOpenChange,
  expense,
  clients = [],
  projects = [],
  defaults = NO_DEFAULTS,
  onSaved,
}: any) {
  const { user } = useAuth();
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [receipt, setReceipt] = useState({ uri: "", name: "" });
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError("");
    if (expense) {
      setForm({ ...emptyForm, ...expense });
      setReceipt({
        uri: expense.receipt_uri || "",
        name: expense.receipt_name || "",
      });
    } else {
      setForm({ ...emptyForm, ...defaults });
      setReceipt({ uri: "", name: "" });
    }
  }, [open, expense, defaults]);

  const set = (key: any) => (value: any) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const uploadReceipt = async (event: any) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError("Receipt must be smaller than 5 MB.");
      return;
    }
    setUploading(true);
    setError("");
    try {
      const { file_uri } = await backend.files.uploadPrivate({
        file,
      });
      setReceipt({ uri: file_uri, name: file.name });
    } catch (err: any) {
      setError(err?.message || "Could not upload the receipt.");
    } finally {
      setUploading(false);
    }
  };

  const submit = async (event: any) => {
    event.preventDefault();
    if (!form.title.trim()) {
      setError("Expense title is required.");
      return;
    }
    if (!Number(form.amount)) {
      setError("Enter the expense amount.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload = {
        ...form,
        title: form.title.trim(),
        amount: Number(form.amount),
        receipt_uri: receipt.uri,
        receipt_name: receipt.name,
      };
      let saved;
      if (expense?.id) {
        saved = await backend.entities.Expense.update(expense.id, payload);
        await logActivity({
          user,
          action: "Expense updated",
          entityType: "Expense",
          entityId: expense.id,
          label: saved.title,
        });
        toast.success("Expense updated");
      } else {
        const expense_code = await nextSequence(
          "Expense",
          "expense_code",
          "EXP",
        );
        saved = await backend.entities.Expense.create({
          ...payload,
          expense_code,
        });
        await logActivity({
          user,
          action: "Expense created",
          entityType: "Expense",
          entityId: saved.id,
          label: saved.title,
        });
        toast.success("Expense added");
      }
      onSaved?.(saved);
      onOpenChange(false);
    } catch (err: any) {
      setError(err?.message || "Could not save this expense.");
    } finally {
      setSaving(false);
    }
  };

  const projectOptions = form.client_id
    ? projects.filter((p: any) => p.client_id === form.client_id)
    : projects;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-[600px] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading text-lg">
            {expense ? "Edit expense" : "New expense"}
          </DialogTitle>
          <DialogDescription className="text-[12.5px]">
            Track business costs and attach receipts.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <FormError message={error} />
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField
              label="Title"
              value={form.title}
              onChange={set("title")}
              required
              className="sm:col-span-2"
            />
            <SelectField
              label="Category"
              value={form.category}
              onChange={set("category")}
              options={EXPENSE_CATEGORIES}
            />
            <NumberField
              label="Amount (₹)"
              value={form.amount}
              onChange={set("amount")}
              required
            />
            <TextField
              label="Date"
              type="date"
              value={form.expense_date}
              onChange={set("expense_date")}
            />
            <TextField
              label="Vendor"
              value={form.vendor}
              onChange={set("vendor")}
            />
            <SelectField
              label="Paid via"
              value={form.payment_method}
              onChange={set("payment_method")}
              options={PAYMENT_METHODS}
            />
            <SelectField
              label="Status"
              value={form.status}
              onChange={set("status")}
              options={EXPENSE_STATUS_OPTIONS}
            />
            <SelectField
              label="Client (optional)"
              value={form.client_id}
              onChange={set("client_id")}
              options={clientOptions(clients)}
              placeholder="Not client-specific"
            />
            <SelectField
              label="Project (optional)"
              value={form.project_id}
              onChange={set("project_id")}
              options={projectOptions.map((p: any) => ({
                value: p.id,
                label: p.title,
              }))}
              placeholder="Not project-specific"
              className="sm:col-span-2"
            />
            <TextAreaField
              label="Description"
              value={form.description}
              onChange={set("description")}
              rows={2}
              className="sm:col-span-2"
            />
            <Field
              label="Receipt"
              hint="PDF or image, up to 5 MB"
              className="sm:col-span-2"
            >
              <Input
                type="file"
                accept="image/*,application/pdf"
                onChange={uploadReceipt}
                disabled={uploading}
                className="h-9 bg-white text-[12px]"
              />
              {(uploading || receipt.name) && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {uploading ? "Uploading…" : `Attached: ${receipt.name}`}
                </p>
              )}
            </Field>
            <TextAreaField
              label="Notes"
              value={form.notes}
              onChange={set("notes")}
              rows={2}
              className="sm:col-span-2"
            />
          </div>
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving || uploading}>
              {saving ? "Saving…" : expense ? "Save changes" : "Add expense"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
