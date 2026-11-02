import ClientRef from "@/components/common/ClientRef";
import { inr, fmtDate, amount, num } from "@/lib/format";
import { docTypeMeta, showsPayment } from "@/lib/doc-types";
import { AGREEMENT_TYPES, templateBodyFor } from "@/lib/doc-templates";
import { EMPTY_LEDGER, documentFinancials } from "@/lib/doc-finance";
import { PAYMENT_METHOD_LABELS } from "@/lib/constants";
import PrivateImage from "@/components/common/PrivateImage";

const LEDGER_ENTRIES = ["received", "refunded"];

export default function DocumentPaper({ doc, client, project, settings, ledger = EMPTY_LEDGER }: any) {
  const meta = docTypeMeta(doc.doc_type);
  const items = doc.items || [];
  const isAgreement = AGREEMENT_TYPES.includes(doc.doc_type);
  const showPayment = showsPayment(doc);
  const fin = documentFinancials(doc, project, ledger) || {
    billed: false,
    total: num(doc.total),
    received: num(doc.amount_paid),
    balance: num(doc.balance_due),
    rows: [],
    thisAmount: null,
  };
  const billed = fin.billed;
  const isInvoice = doc.doc_type === "invoice";
  const isReceipt = doc.doc_type === "receipt";
  const showItems = showPayment && !billed && items.length > 0;
  const ledgerRows = (fin.rows || []).filter((p: any) => LEDGER_ENTRIES.includes(p.status));
  const clientName = client?.name || doc.client_name || "—";
  const projectName = doc.project_name || project?.title || "";
  const body = String(doc.body || "").trim() || templateBodyFor(doc.doc_type);

  return (
    <div className="doc-paper mx-auto" data-print-area>
      <div className="flex items-start justify-between gap-6 border-b border-slate-200 pb-5">
        <div className="flex items-start gap-3">
          {settings.logo_url && (
            <img src={settings.logo_url} alt="" className="h-12 w-12 object-contain" />
          )}
          <div>
            <p className="font-heading text-[15px] font-bold leading-tight text-slate-900">
              {settings.company_name}
            </p>
            {settings.tagline && (
              <p className="text-[10px] text-slate-500">{settings.tagline}</p>
            )}
            <div className="mt-1 space-y-0.5 text-[9.5px] leading-relaxed text-slate-500">
              {settings.address && <p className="whitespace-pre-line">{settings.address}</p>}
              {settings.email && <p>{settings.email}</p>}
              {settings.phone && <p>{settings.phone}</p>}
              {settings.website && <p>{settings.website}</p>}
            </div>
          </div>
        </div>
        <div className="text-right">
          <p className="font-heading text-[15px] font-bold uppercase tracking-[0.14em] text-slate-900">
            {meta.label}
          </p>
          <p className="mt-0.5 text-[11px] font-semibold text-blue-700">{doc.doc_number}</p>
          <div className="mt-2 space-y-0.5 text-[9.5px] text-slate-500">
            <p>Issue date: {fmtDate(doc.issue_date)}</p>
            {doc.due_date && <p>Due date: {fmtDate(doc.due_date)}</p>}
            {doc.valid_until && <p>Valid until: {fmtDate(doc.valid_until)}</p>}
            {settings.udyam_number && <p>Registration No.: {settings.udyam_number}</p>}
            {settings.gstin && <p>GSTIN: {settings.gstin}</p>}
          </div>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-6">
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-400">
            Prepared for
          </p>
          <p className="mt-1 text-[12px] font-semibold text-slate-900">
            <ClientRef client={client} name={clientName} />
          </p>
          <div className="mt-1 space-y-0.5 text-[9.5px] leading-relaxed text-slate-500">
            {client?.contact_person && <p>{client.contact_person}</p>}
            {client?.email && <p>{client.email}</p>}
            {client?.phone && <p>{client.phone}</p>}
            {client?.billing_address && (
              <p className="whitespace-pre-line">{client.billing_address}</p>
            )}
            {client?.tax_id && <p>Tax ID: {client.tax_id}</p>}
          </div>
        </div>
        {projectName && (
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-400">
              Project
            </p>
            <p className="mt-1 text-[12px] font-semibold text-slate-900">{projectName}</p>
            <div className="mt-1 space-y-0.5 text-[9.5px] leading-relaxed text-slate-500">
              {project?.project_code && <p>Ref: {project.project_code}</p>}
              {project?.start_date && <p>Start: {fmtDate(project.start_date)}</p>}
              {project?.deadline && <p>Deadline: {fmtDate(project.deadline)}</p>}
              {billed && <p>Agreed project value: {inr(fin.total)}</p>}
            </div>
          </div>
        )}
      </div>

      {doc.title && (
        <p className="mt-5 font-heading text-[12px] font-semibold text-slate-800">{doc.title}</p>
      )}

      <div
        className={
          isAgreement
            ? "mt-3 whitespace-pre-line text-[10.5px] leading-[1.75] text-slate-700"
            : "mt-3 whitespace-pre-line text-[9.5px] leading-relaxed text-slate-600"
        }
      >
        {body}
      </div>

      {showItems && (
        <table className="mt-4 text-[10px]">
          <thead>
            <tr className="bg-slate-50 text-left text-[9px] uppercase tracking-[0.08em] text-slate-500">
              <th className="w-8 border-y border-slate-200 px-2 py-2 font-semibold">#</th>
              <th className="border-y border-slate-200 px-2 py-2 font-semibold">Description</th>
              <th className="w-14 border-y border-slate-200 px-2 py-2 text-right font-semibold">Qty</th>
              <th className="w-24 border-y border-slate-200 px-2 py-2 text-right font-semibold">Rate</th>
              <th className="w-20 border-y border-slate-200 px-2 py-2 text-right font-semibold">Discount</th>
              <th className="w-28 border-y border-slate-200 px-2 py-2 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item: any, index: any) => {
              const gross = Number(item.quantity || 0) * Number(item.rate || 0);
              const line = gross - Math.min(Number(item.discount || 0), gross);
              return (
                <tr key={index} className="align-top text-slate-600">
                  <td className="border-b border-slate-100 px-2 py-2">{index + 1}</td>
                  <td className="border-b border-slate-100 px-2 py-2 text-slate-800">
                    {item.description || "—"}
                  </td>
                  <td className="border-b border-slate-100 px-2 py-2 text-right tabular-nums">
                    {amount(item.quantity)}
                  </td>
                  <td className="border-b border-slate-100 px-2 py-2 text-right tabular-nums">
                    {amount(item.rate)}
                  </td>
                  <td className="border-b border-slate-100 px-2 py-2 text-right tabular-nums">
                    {amount(item.discount)}
                  </td>
                  <td className="border-b border-slate-100 px-2 py-2 text-right font-medium tabular-nums text-slate-900">
                    {amount(line)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {billed && isInvoice && (
        <table className="mt-4 text-[10px]" data-testid="payments-table">
          <thead>
            <tr className="bg-slate-50 text-left text-[9px] uppercase tracking-[0.08em] text-slate-500">
              <th className="w-8 border-y border-slate-200 px-2 py-2 font-semibold">#</th>
              <th className="w-24 border-y border-slate-200 px-2 py-2 font-semibold">Date</th>
              <th className="border-y border-slate-200 px-2 py-2 font-semibold">Payment</th>
              <th className="w-28 border-y border-slate-200 px-2 py-2 font-semibold">Method</th>
              <th className="w-28 border-y border-slate-200 px-2 py-2 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody>
            {ledgerRows.length === 0 && (
              <tr>
                <td colSpan={5} className="border-b border-slate-100 px-2 py-3 text-center text-slate-500">
                  No payments received yet
                </td>
              </tr>
            )}
            {ledgerRows.map((payment: any, index: number) => (
              <tr key={payment.id} className="align-top text-slate-600">
                <td className="border-b border-slate-100 px-2 py-2">{index + 1}</td>
                <td className="border-b border-slate-100 px-2 py-2">{fmtDate(payment.payment_date)}</td>
                <td className="border-b border-slate-100 px-2 py-2 text-slate-800">
                  {payment.payment_code || "—"}
                  {payment.reference ? ` · ${payment.reference}` : ""}
                  {payment.status === "refunded" ? " (refund)" : ""}
                </td>
                <td className="border-b border-slate-100 px-2 py-2">
                  {PAYMENT_METHOD_LABELS[payment.method] || payment.method || "—"}
                </td>
                <td
                  className={`border-b border-slate-100 px-2 py-2 text-right font-medium tabular-nums ${payment.status === "refunded" ? "text-rose-600" : "text-slate-900"}`}
                >
                  {payment.status === "refunded" ? "−" : ""}
                  {amount(payment.amount)}
                </td>
              </tr>
            ))}
            {ledgerRows.length > 0 && (
              <tr className="font-semibold text-slate-900">
                <td colSpan={4} className="px-2 py-2 text-right text-[10px] uppercase tracking-wide text-slate-500">
                  Total received
                </td>
                <td className="px-2 py-2 text-right tabular-nums">{inr(fin.received)}</td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      {showPayment && (
        <div className="mt-3 flex justify-end">
          <table className="w-[58%] text-[10px]">
            <tbody>
              {billed ? (
                isInvoice ? (
                  <>
                    <tr className="border-t border-slate-300">
                      <td className="py-2 font-heading text-[11px] font-bold text-slate-900">
                        Total amount (project value)
                      </td>
                      <td className="py-2 text-right font-heading text-[11px] font-bold tabular-nums text-slate-900">
                        {inr(fin.total)}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-1 text-slate-500">Less: amount received</td>
                      <td className="py-1 text-right tabular-nums text-emerald-700">
                        − {inr(fin.received)}
                      </td>
                    </tr>
                    <tr className="border-t border-slate-300">
                      <td className="py-2 font-heading text-[11px] font-bold text-slate-900">
                        Balance left to pay
                      </td>
                      <td
                        className={`py-2 text-right font-heading text-[11px] font-bold tabular-nums ${fin.balance > 0 ? "text-amber-700" : "text-emerald-700"}`}
                      >
                        {inr(fin.balance)}
                      </td>
                    </tr>
                  </>
                ) : (
                  <>
                    <tr>
                      <td className="py-1 text-slate-500">Project agreed value</td>
                      <td className="py-1 text-right tabular-nums text-slate-800">{inr(fin.total)}</td>
                    </tr>
                    <tr>
                      <td className="py-1 text-slate-500">Received with this receipt</td>
                      <td className="py-1 text-right tabular-nums text-slate-800">
                        {inr(fin.thisAmount ?? doc.total)}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-1 text-slate-500">Received to date</td>
                      <td className="py-1 text-right tabular-nums text-emerald-700">{inr(fin.received)}</td>
                    </tr>
                    <tr className="border-t border-slate-300">
                      <td className="py-2 font-heading text-[11px] font-bold text-slate-900">
                        Balance left to pay
                      </td>
                      <td
                        className={`py-2 text-right font-heading text-[11px] font-bold tabular-nums ${fin.balance > 0 ? "text-amber-700" : "text-emerald-700"}`}
                      >
                        {inr(fin.balance)}
                      </td>
                    </tr>
                  </>
                )
              ) : (
                <>
                  <tr>
                    <td className="py-1 text-slate-500">Subtotal</td>
                    <td className="py-1 text-right tabular-nums text-slate-800">{inr(doc.subtotal)}</td>
                  </tr>
                  {Number(doc.discount_total) > 0 && (
                    <tr>
                      <td className="py-1 text-slate-500">Discounts</td>
                      <td className="py-1 text-right tabular-nums text-slate-800">
                        − {inr(doc.discount_total)}
                      </td>
                    </tr>
                  )}
                  {Number(doc.tax_rate) > 0 && (
                    <tr>
                      <td className="py-1 text-slate-500">Tax @ {doc.tax_rate}%</td>
                      <td className="py-1 text-right tabular-nums text-slate-800">{inr(doc.tax_amount)}</td>
                    </tr>
                  )}
                  <tr className="border-t border-slate-300">
                    <td className="py-2 font-heading text-[11px] font-bold text-slate-900">Total</td>
                    <td className="py-2 text-right font-heading text-[11px] font-bold tabular-nums text-slate-900">
                      {inr(fin.total)}
                    </td>
                  </tr>
                  {fin.received > 0 && (
                    <>
                      <tr>
                        <td className="py-1 text-slate-500">Amount received</td>
                        <td className="py-1 text-right tabular-nums text-emerald-700">{inr(fin.received)}</td>
                      </tr>
                      <tr>
                        <td className="py-1 font-semibold text-slate-700">Balance due</td>
                        <td className="py-1 text-right font-semibold tabular-nums text-slate-900">
                          {inr(fin.balance)}
                        </td>
                      </tr>
                    </>
                  )}
                </>
              )}
            </tbody>
          </table>
        </div>
      )}

      <div
        className={
          showPayment
            ? "mt-6 grid grid-cols-2 gap-6 text-[9.5px] leading-relaxed text-slate-600"
            : "mt-6 grid grid-cols-1 gap-6 text-[9.5px] leading-relaxed text-slate-600"
        }
      >
        {showPayment && (
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-400">
              Payment instructions
            </p>
            <p className="mt-1 whitespace-pre-line">
              {doc.payment_instructions ||
                settings.payment_instructions ||
                "Bank details are shared on request — please write to us before transferring."}
            </p>
            {settings.bank_details && (
              <p className="mt-2 whitespace-pre-line text-slate-500">{settings.bank_details}</p>
            )}
          </div>
        )}
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-400">
            Terms & conditions
          </p>
          <p className="mt-1 whitespace-pre-line">{doc.terms || settings.default_terms}</p>
        </div>
      </div>

      {doc.notes && (
        <div className="mt-4 rounded border border-slate-200 bg-slate-50 px-3 py-2 text-[9.5px] leading-relaxed text-slate-600">
          <span className="font-semibold text-slate-700">Notes: </span>
          {doc.notes}
        </div>
      )}

      <div className="mt-10">
        <div className="flex items-end justify-between gap-8">
          {isAgreement ? (
            <div className="w-[200px] text-[9.5px] text-slate-600">
              <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                Accepted by client
              </p>
              <div className="flex h-[60px] items-end border-b border-slate-400" />
              <p className="mt-1">Client signature</p>
            </div>
          ) : (
            <div className="text-[9px] leading-relaxed text-slate-400">
              <p>{settings.default_footer}</p>
              <p>
                {doc.doc_number} · {settings.company_name}
              </p>
            </div>
          )}

          <div className="w-[200px] text-right text-[9.5px] text-slate-600">
            <p className="text-slate-500">For {settings.company_name}</p>
            <div className="flex h-[60px] items-end justify-end border-b border-slate-400">
              <PrivateImage
                fileUri={settings.signature_uri}
                alt="Authorised signature"
                className="max-h-[58px] w-auto object-contain"
              />
            </div>
            <p className="mt-1">{settings.signature_name || "Authorised signatory"}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
