import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Plus, RotateCcw, Trash2 } from "lucide-react";
import {
  DOC_TYPES,
  docTypeMeta,
  computeTotals,
  emptyItem,
  showsPayment,
} from "@/lib/doc-types";
import { isTemplateBody, templateBodyFor } from "@/lib/doc-templates";
import { inr } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Field,
  SelectField,
  TextAreaField,
  TextField,
} from "@/components/common/FormFields";
import { fetchClients } from "@/lib/clients";
import { fetchAll } from "@/lib/db";
import { EMPTY_LEDGER, documentFinancials, isProjectBilled } from "@/lib/doc-finance";
import { fmtDate } from "@/lib/format";
import { PAYMENT_METHOD_LABELS } from "@/lib/constants";

const STATUS_OPTIONS = [
  { value: "draft", label: "Draft" },
  { value: "sent", label: "Sent" },
  { value: "accepted", label: "Accepted" },
  { value: "partially_paid", label: "Partially paid" },
  { value: "paid", label: "Paid" },
  { value: "cancelled", label: "Cancelled" },
];

export default function DocumentForm({ form, setForm, settings, ledger = EMPTY_LEDGER }: any) {
  const update = (key: any, value: any) => setForm((prev: any) => ({ ...prev, [key]: value }));
  const clientsQuery = useQuery({
    queryKey: ["form-clients"],
    queryFn: () => fetchClients(),
  });
  const clients = clientsQuery.data || [];
  const selectedClient = clients.find((c: any) => c.id === form.client_id);
  const clientOptions = [
    ...clients.map((c: any) => ({
      value: c.id,
      label: c.client_code ? `${c.name} · ${c.client_code}` : c.name,
    })),
    // A document saved before this dropdown existed keeps its typed name until a client is chosen.
    ...(!selectedClient && form.client_name
      ? [{ value: "__unlinked", label: `${form.client_name} (not in client list)` }]
      : []),
  ];
  // Choosing a client stores its ID and name together, so the document always points at the record.
  const pickClient = (id: any) => {
    const client = clients.find((c: any) => c.id === id);
    if (!client) return;
    setForm((prev: any) => {
      // A different client means the previously chosen project no longer applies.
      const changed = prev.client_id !== client.id;
      return {
        ...prev,
        client_id: client.id,
        client_name: client.name,
        project_id: changed ? "" : prev.project_id,
        project_name: changed ? "" : prev.project_name,
      };
    });
  };

  const projectsQuery = useQuery({
    queryKey: ["form-projects", form.client_id],
    queryFn: () => (form.client_id ? fetchAll("Project", { client_id: form.client_id }) : Promise.resolve([])),
    enabled: Boolean(form.client_id),
  });
  const clientProjects = projectsQuery.data || [];
  const projectOptions = clientProjects.map((p: any) => ({
    value: p.id,
    label: p.project_code ? `${p.title} · ${p.project_code}` : p.title,
  }));
  const pickProject = (id: any) => {
    const project = clientProjects.find((p: any) => p.id === id);
    if (!project) return;
    setForm((prev: any) => ({ ...prev, project_id: project.id, project_name: project.title }));
  };
  const meta = docTypeMeta(form.doc_type);
  const totals = computeTotals(form.items, form.tax_rate);
  const paymentVisible = showsPayment(form);
  const selectedProject = clientProjects.find((p: any) => p.id === form.project_id);
  const billed = isProjectBilled(form, selectedProject);
  // Live figures from the ledger: the same numbers the printed paper shows.
  const fin = documentFinancials(
    { ...form, total: billed ? form.total : totals.total },
    selectedProject,
    ledger,
  );
  const billedRows = (fin?.rows || []).filter((p: any) => ["received", "refunded"].includes(p.status));

  // Changing the type swaps in that type's template unless the wording was edited by hand.
  const changeType = (value: any) =>
    setForm((prev: any) => ({
      ...prev,
      doc_type: value,
      body: isTemplateBody(prev.body) ? templateBodyFor(value) : prev.body,
    }));

  const setItem = (index: any, patch: any) =>
    setForm((prev: any) => ({
      ...prev,
      items: prev.items.map((item: any, i: any) =>
        i === index ? { ...item, ...patch } : item,
      ),
    }));

  const addItem = () =>
    setForm((prev: any) => ({ ...prev, items: [...prev.items, emptyItem()] }));

  const removeItem = (index: any) =>
    setForm((prev: any) => ({
      ...prev,
      items: prev.items.filter((_: any, i: any) => i !== index),
    }));

  const moveItem = (index: any, direction: any) =>
    setForm((prev: any) => {
      const items = [...prev.items];
      const target = index + direction;
      if (target < 0 || target >= items.length) return prev;
      [items[index], items[target]] = [items[target], items[index]];
      return { ...prev, items };
    });

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SelectField
          label="Document type"
          value={form.doc_type}
          onChange={changeType}
          options={DOC_TYPES.map((type) => ({
            value: type.value,
            label: type.label,
          }))}
          hint="Each type uses its own layout and default wording"
        />
        <div className="sm:col-span-1">
          <p className="mb-1 text-[12px] font-medium text-slate-600">
            Document number
          </p>
          <div className="flex h-9 items-center rounded-md border border-dashed border-border bg-secondary/50 px-3 text-[12px] text-muted-foreground">
            {form.doc_number || "Assigned automatically on save"}
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Unique, generated in the database
          </p>
        </div>
        <SelectField
          label="Client"
          value={form.client_id || (form.client_name ? "__unlinked" : "")}
          onChange={pickClient}
          options={clientOptions}
          placeholder="Choose a client"
          hint="Name, contact and billing details come from the client record"
        />
        {selectedClient && (
          <div className="rounded-md border border-border bg-secondary/40 p-3 text-[12px] text-muted-foreground sm:col-span-2">
            <p className="font-medium text-foreground">
              {selectedClient.name}
              {selectedClient.client_code ? ` · ${selectedClient.client_code}` : ""}
            </p>
            <p>
              {[selectedClient.contact_person, selectedClient.email, selectedClient.phone]
                .filter(Boolean)
                .join(" · ")}
            </p>
            {selectedClient.billing_address && (
              <p className="whitespace-pre-line">{selectedClient.billing_address}</p>
            )}
            {selectedClient.tax_id && <p>Tax ID: {selectedClient.tax_id}</p>}
          </div>
        )}
        <SelectField
          label="Project"
          value={form.project_id || (form.project_name ? "__unlinked" : "")}
          onChange={pickProject}
          options={[
            ...projectOptions,
            ...(!form.project_id && form.project_name
              ? [{ value: "__unlinked", label: `${form.project_name} (not linked to a project)` }]
              : []),
          ]}
          placeholder={form.client_id ? "Choose a project" : "Choose a client first"}
          hint={
            form.client_id && !clientProjects.length
              ? "This client has no projects yet. Create one under Projects first."
              : "Only this client's projects are listed"
          }
        />
        <TextField
          label="Issue date"
          type="date"
          value={form.issue_date}
          onChange={(value: any) => update("issue_date", value)}
        />
        <TextField
          label={meta.expiry ? "Valid until" : "Due date"}
          type="date"
          value={meta.expiry ? form.valid_until : form.due_date}
          onChange={(value: any) =>
            update(meta.expiry ? "valid_until" : "due_date", value)
          }
        />
        <SelectField
          label="Status"
          value={form.status}
          onChange={(value: any) => update("status", value)}
          options={STATUS_OPTIONS}
        />
        <TextField
          label="Document title"
          value={form.title}
          onChange={(value: any) => update("title", value)}
          placeholder={meta.label}
        />
      </div>

      <Field
        label={`${meta.label} wording`}
        hint="Leave this as it is to use the standard, type-specific legal wording. Anything you write replaces it."
      >
        <Textarea
          value={form.body || ""}
          onChange={(event) => update("body", event.target.value)}
          rows={12}
          className="bg-white text-[11.5px] leading-relaxed"
          placeholder={templateBodyFor(form.doc_type)}
        />
        <div className="mt-2 flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => update("body", templateBodyFor(form.doc_type))}
          >
            <RotateCcw className="mr-1 h-3.5 w-3.5" /> Reset to default template
          </Button>
          <span className="self-center text-[11px] text-muted-foreground">
            {isTemplateBody(form.body)
              ? "Using the default template"
              : "Edited — your wording will be used"}
          </span>
        </div>
      </Field>

      <div className="flex items-start justify-between gap-4 rounded-lg border border-border bg-white p-3">
        <div className="min-w-0">
          <p className="text-[12.5px] font-medium text-slate-800">
            Show payment &amp; amount section
          </p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
            {paymentVisible
              ? "Line-item amounts, totals, amount received, balance due and payment instructions appear on the printed paper."
              : "Hidden on the printed paper, so no amounts or payment details show. Turn it on for quotations, invoices and receipts that need pricing."}
          </p>
          {typeof form.show_payment === "boolean" && (
            <button
              type="button"
              onClick={() => update("show_payment", null)}
              className="mt-1 text-[11px] font-medium text-blue-700 hover:underline"
            >
              Use the default for this document type
            </button>
          )}
        </div>
        <Switch
          checked={paymentVisible}
          onCheckedChange={(value: boolean) => update("show_payment", value)}
          aria-label="Show payment and amount section"
        />
      </div>

      {billed ? (
        <div className="rounded-lg border border-border bg-white p-3">
          <p className="mb-2 text-[12px] font-semibold text-slate-600">
            Payments received for {selectedProject?.title}
          </p>
          {billedRows.length === 0 ? (
            <p className="text-[12px] text-muted-foreground">
              No payments yet. Record them from the Record payment button and they appear here and on the invoice automatically.
            </p>
          ) : (
            <ul className="divide-y divide-border/70 text-[12px]">
              {billedRows.map((payment: any) => (
                <li key={payment.id} className="flex items-center justify-between gap-2 py-1.5">
                  <span>
                    {fmtDate(payment.payment_date)} · {payment.payment_code}
                    {" · "}
                    {PAYMENT_METHOD_LABELS[payment.method] || payment.method}
                    {payment.status === "refunded" ? " (refund)" : ""}
                  </span>
                  <span className="tabular-nums font-medium">
                    {payment.status === "refunded" ? "−" : ""}
                    {inr(payment.amount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 border-t border-border pt-2 text-right text-[12.5px] font-semibold tabular-nums">
            Total received {inr(fin?.received)}
          </p>
        </div>
      ) : (
      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[12px] font-semibold text-slate-600">
            Line items
            {!paymentVisible && (
              <span className="ml-2 font-normal text-muted-foreground">
                (saved, but hidden on the paper while the payment section is off)
              </span>
            )}
          </p>
          <Button type="button" variant="outline" size="sm" onClick={addItem}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Add item
          </Button>
        </div>
        <div className="space-y-2">
          {form.items.map((item: any, index: any) => (
            <div
              key={index}
              className="rounded-lg border border-border bg-white p-2.5"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <div className="flex-1">
                  <Input
                    value={item.description}
                    onChange={(event) =>
                      setItem(index, { description: event.target.value })
                    }
                    placeholder="Description of work or deliverable"
                    className="h-8 text-[12.5px]"
                  />
                </div>
                <div className="flex items-end gap-2">
                  <div className="w-[70px]">
                    <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                      Qty
                    </p>
                    <Input
                      type="number"
                      min="0"
                      step="0.5"
                      value={item.quantity}
                      onChange={(event) =>
                        setItem(index, { quantity: Number(event.target.value) })
                      }
                      className="h-8 text-[12.5px]"
                    />
                  </div>
                  <div className="w-[110px]">
                    <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                      Rate
                    </p>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.rate}
                      onChange={(event) =>
                        setItem(index, { rate: Number(event.target.value) })
                      }
                      className="h-8 text-[12.5px]"
                    />
                  </div>
                  <div className="w-[100px]">
                    <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                      Discount
                    </p>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.discount}
                      onChange={(event) =>
                        setItem(index, { discount: Number(event.target.value) })
                      }
                      className="h-8 text-[12.5px]"
                    />
                  </div>
                  <div className="w-[110px] pb-1.5 text-right text-[12.5px] font-medium tabular-nums text-slate-700">
                    {inr(
                      Math.max(
                        0,
                        Number(item.quantity || 0) * Number(item.rate || 0) -
                          Number(item.discount || 0),
                      ),
                    )}
                  </div>
                  <div className="flex gap-0.5 pb-0.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => moveItem(index, -1)}
                      title="Move up"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => moveItem(index, 1)}
                      title="Move down"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-rose-500"
                      onClick={() => removeItem(index)}
                      title="Remove"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ))}
          {form.items.length === 0 && (
            <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-[12px] text-muted-foreground">
              No line items yet.
            </p>
          )}
        </div>
      </div>
      )}

      <div className="grid gap-3 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          <TextAreaField
            label="Terms & conditions"
            value={form.terms}
            onChange={(value: any) => update("terms", value)}
            rows={4}
          />
          <TextAreaField
            label="Payment instructions"
            value={form.payment_instructions}
            onChange={(value: any) => update("payment_instructions", value)}
            rows={2}
            hint="Leave blank to use the company default from settings"
          />
          <TextAreaField
            label="Notes"
            value={form.notes}
            onChange={(value: any) => update("notes", value)}
            rows={2}
          />
        </div>
        <div className="rounded-lg border border-border bg-slate-50/70 p-3">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Summary
          </p>
          {!billed && (
            <TextField
              label="Tax rate (%)"
              type="number"
              value={form.tax_rate}
              onChange={(value: any) => update("tax_rate", Number(value))}
            />
          )}
          {billed ? (
            <dl className="mt-3 space-y-1.5 text-[12.5px]">
              <Row label="Project agreed value" value={inr(fin?.total)} strong />
              <Row label="Amount received" value={inr(fin?.received)} />
              <Row label="Balance left to pay" value={inr(fin?.balance)} strong />
              <p className="pt-1 text-[11px] leading-relaxed text-muted-foreground">
                Filled in from the project. Payments are recorded under Payments and listed on the invoice.
              </p>
            </dl>
          ) : (
            <dl className="mt-3 space-y-1.5 text-[12.5px]">
              <Row label="Subtotal" value={inr(totals.subtotal)} />
              <Row label="Discounts" value={inr(totals.discount_total)} />
              <Row
                label={`Tax (${form.tax_rate || 0}%)`}
                value={inr(totals.tax_amount)}
              />
              <div className="border-t border-border pt-1.5">
                <Row label="Total" value={inr(totals.total)} strong />
              </div>
              <Row label="Amount received" value={inr(fin?.received)} />
              <Row label="Balance due" value={inr(fin?.balance)} strong />
            </dl>
          )}
          {!settings.signature_uri && (
            <p className="mt-3 rounded-lg border border-dashed border-border px-2.5 py-2 text-[11px] leading-relaxed text-muted-foreground">
              Add a signature in Settings to print it above the signatory line.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, strong }: any) {
  return (
    <div className="flex items-center justify-between">
      <dt
        className={
          strong ? "font-semibold text-slate-800" : "text-muted-foreground"
        }
      >
        {label}
      </dt>
      <dd
        className={`tabular-nums ${strong ? "font-semibold text-slate-900" : "text-slate-700"}`}
      >
        {value}
      </dd>
    </div>
  );
}
