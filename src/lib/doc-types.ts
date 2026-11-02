import { round2 } from "@/lib/format";

export const DOC_TYPES = [
  { value: "quotation", label: "Quotation", prefixKey: "quotation_prefix", fallbackPrefix: "QUO", expiry: true, financial: true },
  { value: "invoice", label: "Invoice", prefixKey: "invoice_prefix", fallbackPrefix: "INV", due: true, financial: true },
  { value: "receipt", label: "Payment Receipt", prefixKey: "receipt_prefix", fallbackPrefix: "REC", financial: true },
  { value: "agreement", label: "Service Agreement", prefixKey: "agreement_prefix", fallbackPrefix: "AGR" },
  { value: "nda", label: "Non-Disclosure Agreement", prefixKey: "agreement_prefix", fallbackPrefix: "AGR" },
  { value: "sow", label: "Statement of Work", prefixKey: "agreement_prefix", fallbackPrefix: "AGR" },
  { value: "proposal", label: "Project Proposal", prefixKey: "quotation_prefix", fallbackPrefix: "QUO", expiry: true },
  { value: "change_request", label: "Change Request", prefixKey: "quotation_prefix", fallbackPrefix: "QUO" },
  { value: "certificate", label: "Completion Certificate", prefixKey: "agreement_prefix", fallbackPrefix: "AGR" },
  { value: "handover", label: "Handover Document", prefixKey: "agreement_prefix", fallbackPrefix: "AGR" },
  { value: "maintenance", label: "Maintenance Agreement", prefixKey: "agreement_prefix", fallbackPrefix: "AGR" },
  { value: "custom", label: "Custom Document", prefixKey: "quotation_prefix", fallbackPrefix: "DOC" },
];

export const docTypeMeta = (value: any) => DOC_TYPES.find((type) => type.value === value) || DOC_TYPES[0];

export const docTypeLabel = (value: any) => docTypeMeta(value).label;

/**
 * Whether the payment and amount section (line-item amounts, totals, amount received,
 * balance due and payment instructions) appears on the printed paper.
 * An explicit on/off choice saved on the document wins; otherwise financial types show it
 * and agreements, NDAs and SOWs hide it.
 */
export const showsPayment = (doc: any) =>
  typeof doc?.show_payment === "boolean"
    ? doc.show_payment
    : Boolean(docTypeMeta(doc?.doc_type).financial);

export const DOC_STATUS = {
  draft: { label: "Draft", className: "bg-slate-100 text-slate-600 border-slate-200" },
  sent: { label: "Sent", className: "bg-blue-50 text-blue-700 border-blue-200" },
  accepted: { label: "Accepted", className: "bg-cyan-50 text-cyan-700 border-cyan-200" },
  partially_paid: { label: "Part paid", className: "bg-amber-50 text-amber-700 border-amber-200" },
  paid: { label: "Paid", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  overdue: { label: "Overdue", className: "bg-rose-50 text-rose-700 border-rose-200" },
  cancelled: { label: "Cancelled", className: "bg-slate-100 text-slate-500 border-slate-200" },
};

export const emptyItem = () => ({ description: "", quantity: 1, rate: 0, discount: 0 });

/** Line-item maths. Discounts are amounts per line; tax is a rate on the net subtotal. */
export function computeTotals(items: any[] = [], taxRate = 0) {
  let subtotal = 0;
  let discountTotal = 0;
  (items || []).forEach((item) => {
    const gross = Number(item.quantity || 0) * Number(item.rate || 0);
    const discount = Math.min(Number(item.discount || 0), gross);
    subtotal += round2(gross - discount);
    discountTotal += round2(discount);
  });
  const net = round2(subtotal);
  const taxAmount = round2((net * Number(taxRate || 0)) / 100);
  return {
    subtotal: net,
    discount_total: round2(discountTotal),
    tax_amount: taxAmount,
    total: round2(net + taxAmount),
  };
}
