import ClientRef from "@/components/common/ClientRef";
import { inr, fmtDate, amount, num } from "@/lib/format";
import { computeTotals, docTypeMeta, showsPayment } from "@/lib/doc-types";
import { AGREEMENT_TYPES, renderLegalBody, templateBodyFor } from "@/lib/doc-templates";
import { EMPTY_LEDGER, documentFinancials } from "@/lib/doc-finance";
import PrivateImage from "@/components/common/PrivateImage";
import { useQuery } from "@tanstack/react-query";
import { fetchAll } from "@/lib/db";
import { milestoneStatusLabel, milestoneTimeline, sortProjectMilestones } from "@/lib/milestones";

export default function DocumentPaper({ doc, client, project, settings, ledger = EMPTY_LEDGER }: any) {
  const meta = docTypeMeta(doc.doc_type);
  const items = doc.items || [];
  const isAgreement = AGREEMENT_TYPES.includes(doc.doc_type);
  const showPayment = showsPayment(doc);
  const fin = documentFinancials(doc, project, ledger) || {
    billed: false,
    total: num(doc.total),
    toBePaid: num(doc.total),
    received: num(doc.amount_paid),
    balance: num(doc.balance_due),
    dueNow: num(doc.balance_due),
    rows: [],
    thisAmount: null,
  };
  const billed = fin.billed;
  const isInvoice = doc.doc_type === "invoice";
  const isReceipt = doc.doc_type === "receipt";
  const showItems = showPayment && items.length > 0;
  const documentClient = doc.client_snapshot || client || {};
  const documentSettings = doc.organization_snapshot ? { ...settings, ...doc.organization_snapshot } : settings;
  const clientName = documentClient.legal_name || documentClient.name || doc.client_name || "—";
  const clientSignatory = doc.client_authorised_signatory_name || documentClient.authorised_signatory_name || "";
  const documentProject = doc.project_reference_snapshot || project || {};
  const projectName = doc.project_name || doc.project_reference_snapshot?.title || project?.title || "";
  const body = renderLegalBody(String(doc.body || "").trim() || templateBodyFor(doc.doc_type), documentSettings);
  const { data: projectMilestones = [] } = useQuery({
    queryKey: ["document-project-milestones", project?.id, doc.doc_type],
    queryFn: () => fetchAll("Milestone", { project_id: project.id }),
    enabled: doc.doc_type === "sow" && doc.status === "draft" && Boolean(project?.id),
    staleTime: 30_000,
  });

  const milestones = sortProjectMilestones(
    doc.status === "draft"
      ? projectMilestones
      : Array.isArray(doc.project_milestones_snapshot) ? doc.project_milestones_snapshot : [],
  );
  const companyName = documentSettings.company_name || "";

  return (
    <div className="doc-paper mx-auto" data-print-area>
      <div className="avoid-break flex items-start justify-between gap-6 border-b border-slate-200 pb-5">
        <div className="flex items-start gap-3">
          {documentSettings.logo_url && (
            <img src={documentSettings.logo_url} alt="" className="h-12 w-12 object-contain" />
          )}
          <div>
            <p className="font-heading text-[15px] font-bold leading-tight text-slate-900">
              {documentSettings.company_name}
            </p>
            {documentSettings.tagline && (
              <p className="text-[10px] text-slate-500">{documentSettings.tagline}</p>
            )}
            <div className="mt-1 space-y-0.5 text-[9.5px] leading-relaxed text-slate-500">
              {documentSettings.address && <p className="whitespace-pre-line">{documentSettings.address}</p>}
              {documentSettings.email && <p>{documentSettings.email}</p>}
              {documentSettings.phone && <p>{documentSettings.phone}</p>}
              {documentSettings.website && <p>{documentSettings.website}</p>}
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
            {doc.revision_number && <p>Revision: {doc.revision_number}{doc.revision_date ? ` · ${fmtDate(doc.revision_date)}` : ""}</p>}
            {doc.due_date && <p>Due date: {fmtDate(doc.due_date)}</p>}
            {doc.valid_until && <p>Valid until: {fmtDate(doc.valid_until)}</p>}
            {documentSettings.udyam_number && <p>Registration No.: {documentSettings.udyam_number}</p>}
            {documentSettings.gstin && <p>GSTIN: {documentSettings.gstin}</p>}
            {isAgreement && <p>Governing law: {documentSettings.governing_law || "Laws of India"}</p>}
            {isAgreement && documentSettings.jurisdiction_city && <p>Agreed court location (subject to legal competence): {[documentSettings.jurisdiction_city, documentSettings.jurisdiction_state, documentSettings.jurisdiction_country].filter(Boolean).join(", ")}</p>}
          </div>
        </div>
      </div>

      <div className="avoid-break mt-5 grid grid-cols-2 gap-6">
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-400">
            Prepared for
          </p>
          <p className="mt-1 text-[12px] font-semibold text-slate-900">
            <ClientRef client={client} name={clientName} />
          </p>
          <div className="mt-1 space-y-0.5 text-[9.5px] leading-relaxed text-slate-500">
            {documentClient.contact_person && <p>{documentClient.contact_person}</p>}
            {documentClient.email && <p>{documentClient.email}</p>}
            {documentClient.phone && <p>{documentClient.phone}</p>}
            {documentClient.billing_address && (
              <p className="whitespace-pre-line">{documentClient.billing_address}</p>
            )}
            {documentClient.tax_id && <p>Tax ID: {documentClient.tax_id}</p>}
          </div>
        </div>
        {projectName && (
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-400">
              Project
            </p>
            <p className="mt-1 text-[12px] font-semibold text-slate-900">{projectName}</p>
            <div className="mt-1 space-y-0.5 text-[9.5px] leading-relaxed text-slate-500">
              {documentProject.project_code && <p>Ref: {documentProject.project_code}</p>}
              {documentProject.start_date && <p>Start: {fmtDate(documentProject.start_date)}</p>}
              {documentProject.deadline && <p>Deadline: {fmtDate(documentProject.deadline)}</p>}
              {billed && <p>Agreed project value: {inr(fin.actual)}</p>}
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
            ? "legal-body mt-3 whitespace-pre-line text-[10.5px] leading-[1.75] text-slate-700"
            : "legal-body mt-3 whitespace-pre-line text-[9.5px] leading-relaxed text-slate-600"
        }
      >
        {body}
      </div>

      {doc.doc_type === "sow" && milestones.length > 0 && (
        <section className="sow-milestone-section mt-5">
          <h3 className="sow-milestone-heading mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-700">
            Project phases &amp; milestone schedule
          </h3>
          <table className="sow-milestone-table w-full table-fixed text-[9.5px]">
            <colgroup><col style={{ width: "48%" }} /><col style={{ width: "30%" }} /><col style={{ width: "22%" }} /></colgroup>
            <thead><tr>
              <th className="border border-slate-300 bg-slate-100 px-2 py-2 text-left font-semibold text-slate-700">Phase / Milestone</th>
              <th className="border border-slate-300 bg-slate-100 px-2 py-2 text-left font-semibold text-slate-700">Timeline</th>
              <th className="border border-slate-300 bg-slate-100 px-2 py-2 text-left font-semibold text-slate-700">Status at Issue</th>
            </tr></thead>
            <tbody>{milestones.map((milestone: any, index: number) => (
              <tr key={milestone.id || `milestone-${index}`} className="sow-milestone-row">
                <td className="border border-slate-200 px-2 py-2 align-top text-slate-800">
                  <span className="font-medium">{index + 1}. {milestone.title || "Untitled milestone"}</span>
                  {milestone.description && <p className="mt-0.5 whitespace-pre-line text-[8.5px] text-slate-500">{milestone.description}</p>}
                </td>
                <td className="border border-slate-200 px-2 py-2 align-top tabular-nums text-slate-700">{milestoneTimeline(milestone)}</td>
                <td className="border border-slate-200 px-2 py-2 align-top text-slate-700">{milestoneStatusLabel(milestone.status)}</td>
              </tr>
            ))}</tbody>
          </table>
          <p className="mt-2 text-[8.5px] leading-relaxed text-slate-500">
            The milestones, deliverables and indicative timelines set out above form part of the agreed project scope. Any mutually agreed modification to these milestones, deliverables or timelines shall be documented and approved by the parties in writing, including through an appropriately revised Statement of Work where applicable. Internal project-management updates alone shall not amend the parties’ executed contractual obligations.
          </p>
        </section>
      )}

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
                  <td className="border-b border-slate-100 px-2 py-2 text-slate-800">{item.description || "—"}</td>
                  <td className="border-b border-slate-100 px-2 py-2 text-right tabular-nums">{amount(item.quantity)}</td>
                  <td className="border-b border-slate-100 px-2 py-2 text-right tabular-nums">{amount(item.rate)}</td>
                  <td className="border-b border-slate-100 px-2 py-2 text-right tabular-nums">{amount(item.discount)}</td>
                  <td className="border-b border-slate-100 px-2 py-2 text-right font-medium tabular-nums text-slate-900">{amount(line)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {showPayment && (
        <div className="avoid-break mt-3 flex flex-col items-end">
          <table className="w-[58%] text-[10px]">
            <tbody>
              {billed ? (
                isInvoice ? (
                  <>
                    <tr>
                      <td className="py-1 text-slate-500">Sum of line items</td>
                      <td className="py-1 text-right tabular-nums text-slate-800">{inr(fin.toBePaid)}</td>
                    </tr>
                    <tr>
                      <td className="py-1 text-slate-500">Total amount (actual price)</td>
                      <td className="py-1 text-right tabular-nums text-slate-800">{inr(fin.actual)}</td>
                    </tr>
                    <tr>
                      <td className="py-1 text-slate-500">Already paid before this invoice</td>
                      <td className="py-1 text-right tabular-nums text-slate-800">{inr(fin.paidBefore)}</td>
                    </tr>
                    <tr className="border-t border-slate-300">
                      <td className="py-2 font-heading text-[11px] font-bold text-slate-900">
                        Amount left to pay
                      </td>
                      <td
                        className={`py-2 text-right font-heading text-[11px] font-bold tabular-nums ${fin.left > 0 ? "text-amber-700" : "text-emerald-700"}`}
                      >
                        {inr(fin.left)}
                      </td>
                    </tr>
                  </>
                ) : (
                  <>
                    <tr>
                      <td className="py-1 text-slate-500">Project actual price</td>
                      <td className="py-1 text-right tabular-nums text-slate-800">{inr(fin.actual)}</td>
                    </tr>
                    <tr>
                      <td className="py-1 text-slate-500">Paid before this receipt</td>
                      <td className="py-1 text-right tabular-nums text-slate-800">{inr(fin.paidBefore)}</td>
                    </tr>
                    <tr>
                      <td className="py-1 text-slate-500">Received with this receipt</td>
                      <td className="py-1 text-right tabular-nums text-slate-800">{inr(fin.thisAmount)}</td>
                    </tr>
                    <tr>
                      <td className="py-1 text-slate-500">Total paid to date</td>
                      <td className="py-1 text-right tabular-nums text-emerald-700">{inr(fin.received)}</td>
                    </tr>
                    <tr className="border-t border-slate-300">
                      <td className="py-2 font-heading text-[11px] font-bold text-slate-900">
                        Amount left to pay
                      </td>
                      <td
                        className={`py-2 text-right font-heading text-[11px] font-bold tabular-nums ${fin.left > 0 ? "text-amber-700" : "text-emerald-700"}`}
                      >
                        {inr(fin.left)}
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
          {billed && isInvoice && (
            <div className="avoid-break mt-3 flex w-[58%] items-center justify-between rounded border-2 border-slate-900 px-3 py-2">
              <span className="font-heading text-[11px] font-bold uppercase tracking-wide text-slate-900">
                Total amount to be paid
              </span>
              <span className="font-heading text-[13px] font-bold tabular-nums text-slate-900">
                {inr(fin.toBePaid)}
              </span>
            </div>
          )}
          {billed && !isInvoice && (
            <div className="avoid-break mt-3 flex w-[58%] items-center justify-between rounded border-2 border-slate-900 px-3 py-2">
              <span className="font-heading text-[11px] font-bold uppercase tracking-wide text-slate-900">
                Amount received now
              </span>
              <span className="font-heading text-[13px] font-bold tabular-nums text-slate-900">
                {inr(fin.thisAmount)}
              </span>
            </div>
          )}
        </div>
      )}

      <div
        className={
          showPayment
            ? "avoid-break mt-6 grid grid-cols-2 gap-6 text-[9.5px] leading-relaxed text-slate-600"
            : "avoid-break mt-6 grid grid-cols-1 gap-6 text-[9.5px] leading-relaxed text-slate-600"
        }
      >
        {showPayment && (
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-400">
              Payment instructions
            </p>
            <p className="mt-1 whitespace-pre-line">
              {doc.payment_instructions ||
                documentSettings.payment_instructions ||
                "Bank details are shared on request — please write to us before transferring."}
            </p>
            {documentSettings.bank_details && (
              <p className="mt-2 whitespace-pre-line text-slate-500">{documentSettings.bank_details}</p>
            )}
          </div>
        )}
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-400">
            Terms & conditions
          </p>
          <p className="mt-1 whitespace-pre-line">{doc.terms || documentSettings.default_terms}</p>
        </div>
      </div>

      {doc.notes && (
        <div className="avoid-break mt-4 rounded border border-slate-200 bg-slate-50 px-3 py-2 text-[9.5px] leading-relaxed text-slate-600">
          <span className="font-semibold text-slate-700">Notes: </span>
          {doc.notes}
        </div>
      )}

      <div className="document-signature-block avoid-break mt-10 pb-2">
        {isAgreement ? (
          <div className="legal-signature-grid grid grid-cols-2 items-start gap-8 text-[9.5px] leading-relaxed text-slate-600">
            <div className="legal-signature-column min-w-0">
              <p className="legal-signature-heading font-semibold uppercase tracking-[0.12em] text-slate-700">For the Client</p>
              <div className="legal-signature-identity mt-1 break-words">Legal name: {clientName}</div>
              <div className="legal-signature-seal-slot" aria-hidden="true" />
              <div className="legal-signature-line border-b border-slate-500" />
              <p className="mt-1">Signature of authorised signatory</p>
              <p className="mt-2 break-words">Name: {clientSignatory || "____________________________"}</p>
              <p>Date: _________________________________</p>
            </div>
            <div className="legal-signature-column min-w-0">
              <p className="legal-signature-heading font-semibold uppercase tracking-[0.12em] text-slate-700">For {companyName}</p>
              <div className="legal-signature-identity mt-1" aria-hidden="true" />
              <div className="legal-signature-seal-slot">
                {documentSettings.signature_uri ? (
                  <PrivateImage fileUri={documentSettings.signature_uri} alt="Company seal and authorised signature"
                    className="legal-signature-seal max-h-full max-w-full object-contain" />
                ) : null}
              </div>
              <div className="legal-signature-line border-b border-slate-500" />
              <p className="mt-1">Signature of authorised signatory</p>
              <p className="mt-2 break-words">Name: {documentSettings.signature_name || "____________________________"}</p>
              <p>Date: _________________________________</p>
            </div>
          </div>
        ) : (
          <div className="flex items-end justify-between gap-8 text-[9px] leading-relaxed text-slate-400">
            <div><p>{documentSettings.default_footer}</p><p>{doc.doc_number} · {companyName}</p></div>
            <div className="w-[200px] text-right">
              <p className="normal-case">For {companyName}</p>
              {documentSettings.signature_uri && <PrivateImage fileUri={documentSettings.signature_uri} alt="Authorised signature" className="ml-auto max-h-[58px] max-w-full object-contain" />}
              <p>Name: {documentSettings.signature_name || "____________________________"}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
