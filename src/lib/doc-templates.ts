/**
 * Legal / business wording used when a document has no body of its own.
 * Every template is a starting point written in plain language — it is not legal advice
 * and should be reviewed before it is signed.
 */
export const DOC_TEMPLATES = {
  quotation: {
    body: `This quotation sets out the scope, deliverables and price for the work described below. It is valid until the date shown above.
The quotation covers the deliverables listed on this document only. Any additional page, feature, integration or revision outside that scope is quoted separately in writing before it is started.
Prices are exclusive of third-party costs such as domain registration, hosting, paid APIs and stock assets unless those are listed as line items.
Acceptance of this quotation may be given in writing (email is sufficient) and is taken as agreement to the payment terms below.`,
  },
  invoice: {
    body: `This invoice is raised for the work and deliverables listed below, in accordance with the agreed quotation or scope of work.
Please pay the total amount to be paid shown above, and quote the invoice number in the payment reference. Any amount left to pay is due later, as agreed in the project schedule.
Third-party costs (domain, hosting, paid APIs) are billed at actuals unless they appear as fixed line items.
Late payment may pause delivery or support until the outstanding balance is settled.`,
  },
  receipt: {
    body: `Received with thanks the amount shown below against the document referenced in this receipt.
This receipt confirms money actually received and does not by itself settle any other invoice or outstanding balance.`,
  },
  agreement: {
    body: `1. PARTIES
This agreement is made between the service provider named above ("Provider") and the client named above ("Client").

2. SCOPE OF WORK
The Provider will deliver the services described in this agreement and the accompanying proposal or statement of work. Anything not described there is outside scope.

3. DELIVERABLES AND TIMELINE
Deliverables and milestones are as agreed at project kick-off. Timelines assume timely feedback, content and approvals from the Client.

4. PAYMENT
50% of the agreed fee is payable before work begins and the remaining 50% on completion, before final handover. Invoices are payable within 7 days of issue unless agreed otherwise in writing.

5. CLIENT RESPONSIBILITIES
The Client will provide content, access, approvals and a single point of contact within a reasonable time. Delays caused by pending inputs extend the timeline accordingly.

6. CHANGE REQUESTS
Any change to scope, design direction or features is handled through a written change request, quoted separately before work starts.

7. THIRD-PARTY SERVICES
Domains, hosting, paid APIs and similar services are procured in the Client's name unless agreed otherwise, and are billed at actuals.

8. INTELLECTUAL PROPERTY
On full payment, ownership of the delivered work transfers to the Client. The Provider retains the right to reuse generic code, know-how and non-confidential components. Third-party assets remain governed by their own licences.

9. CONFIDENTIALITY
Both parties keep shared business information confidential and use it only to perform this agreement.

10. DATA PROTECTION
Personal data shared for this engagement is used only to deliver the agreed services and is not sold or shared for marketing.

11. SUPPORT AND MAINTENANCE
Post-handover support is not included unless a separate maintenance agreement is signed.

12. TERMINATION
Either party may terminate in writing. Work completed up to that date is payable, and delivered materials are handed over once dues are settled.

13. LIABILITY
The Provider's total liability under this agreement is limited to the fees paid for this specific engagement, to the extent permitted by law.

14. GOVERNING LAW AND DISPUTES
This agreement is governed by the laws of India. The parties will first attempt good-faith resolution, and the courts at the Provider's place of business have jurisdiction.

15. ACCEPTANCE
Work begins, or the Client signs below, only after the terms above are accepted.`,
  },
  nda: {
    body: `1. PURPOSE
The parties wish to explore a possible engagement and, for that purpose, may share confidential information with each other.

2. CONFIDENTIAL INFORMATION
Confidential information means non-public business, technical, financial, product, customer and commercial information disclosed in writing, verbally or electronically, that a reasonable person would treat as confidential.

3. OBLIGATIONS
The receiving party will (a) use the information only for the purpose above, (b) protect it with at least reasonable care, and (c) disclose it only to team members who need it and are bound by similar obligations.

4. EXCLUSIONS
Confidentiality does not apply to information that is already public, was lawfully known before disclosure, is independently developed without use of the disclosed information, or is required to be disclosed by law (with prompt notice where lawful).

5. TERM
These obligations apply from the date of disclosure and continue for three years after the engagement ends, or longer where required by law.

6. RETURN OF MATERIALS
On written request, the receiving party will return or securely destroy the confidential materials it holds, except copies required by law or internal backup policy.

7. NO LICENCE
No licence, ownership or intellectual property right is granted by disclosure.

8. REMEDIES
The parties acknowledge that breach may cause harm not fully remediable in damages, and that injunctive relief may be sought.

9. GOVERNING LAW
This agreement is governed by the laws of India.`,
  },
  sow: {
    body: `1. ENGAGEMENT
This statement of work describes the services, deliverables, schedule and commercials for the engagement named above. It forms part of the governing agreement between the parties.

2. SCOPE
The scope is limited to the deliverables listed in this document. Anything not explicitly listed is out of scope and requires a written change request.

3. DELIVERABLES AND MILESTONES
Each milestone is delivered for review. Review rounds are limited to two per milestone unless agreed otherwise; further rounds are quoted separately.

4. SCHEDULE
Dates assume timely inputs, feedback and approvals from the Client. Dependencies and delays are recorded and the schedule is adjusted accordingly.

5. ACCEPTANCE
A deliverable is accepted when the Client confirms it in writing, or when 7 days pass without substantive written feedback after delivery.

6. FEES AND PAYMENT
Fees, taxes and payment milestones are as set out in this document. Invoices are payable within 7 days of issue.

7. OUT-OF-SCOPE WORK
Additional work is estimated, approved in writing and billed at the agreed rate before it begins.

8. ASSUMPTIONS AND EXCLUSIONS
Third-party subscriptions, domains, hosting, content writing, photography and paid assets are excluded unless listed.

9. GOVERNING TERMS
The terms of the governing agreement apply to this statement of work.`,
  },
  proposal: {
    body: `1. UNDERSTANDING OF THE BRIEF
This proposal responds to the requirement described by the Client and summarises the approach, scope and commercials proposed by the Provider.

2. PROPOSED APPROACH
Work is delivered in phases: discovery and planning, design, build, review and launch. Each phase ends with a review checkpoint for written feedback.

3. DELIVERABLES
The deliverables listed in this document are included. Content, copy, imagery and product data are provided by the Client unless stated otherwise.

4. TIMELINE
The indicative timeline starts on the date the advance is received and inputs are available. Delays in inputs move the schedule.

5. COMMERCIALS
Fees, taxes, payment milestones and validity are as shown in this proposal. Third-party costs are billed at actuals.

6. EXCLUSIONS
Ongoing maintenance, content creation, paid advertising, photography and third-party licences are excluded unless listed.

7. NEXT STEPS
Approval may be given in writing (email is sufficient). On approval, the Provider issues an agreement and an advance invoice to schedule the work.`,
  },
  change_request: {
    body: `1. REQUESTED CHANGE
This document records a change requested by the Client to the scope, design, features or timeline of the project named above.

2. DETAILS OF CHANGE
The change is described in this document. Work on it begins only after written approval by the Client.

3. IMPACT ON SCOPE AND TIMELINE
The change may add or remove deliverables and may move the agreed launch date. The revised timeline takes effect from the approval date.

4. COST IMPACT
Any additional fee is shown in this document. If it is not shown, the change is estimated and confirmed in writing before it starts.

5. UNAFFECTED TERMS
All other terms of the original agreement and statement of work remain unchanged.`,
  },
  certificate: {
    body: `This is to certify that the work and deliverables described in this document have been completed and handed over to the Client named above, in accordance with the agreed scope.

The Client has had the opportunity to review the deliverables. Any items noted as pending are recorded in this document and are excluded from this certification.

This certificate is issued on the date shown above and confirms completion of the engagement described, subject to settlement of any outstanding invoices.`,
  },
  handover: {
    body: `1. HANDOVER SUMMARY
This document records the handover of the completed work, credentials, assets and documentation from the Provider to the Client named above.

2. WHAT IS INCLUDED
Deliverables, source files (where agreed), domain and hosting access, third-party account ownership and usage notes are transferred as listed in this document.

3. CLIENT RESPONSIBILITIES
The Client is responsible for changing shared credentials after handover, keeping renewals active, and maintaining backups once responsibility transfers.

4. WHAT IS NOT INCLUDED
Ongoing maintenance, monitoring, content updates and new features are not included and are covered by a separate agreement.

5. CONFIRMATION
Signature of this document confirms receipt of the handover materials listed above.`,
  },
  maintenance: {
    body: `1. SERVICE COVERAGE
The Provider will provide maintenance and support for the solution described in this document, covering agreed updates, minor fixes, monitoring and reasonable assistance.

2. RESPONSE AND RESOLUTION
Reported issues are acknowledged within one business day and prioritised by severity. Critical outages are addressed first; cosmetic issues are scheduled in the next update window.

3. WHAT IS NOT COVERED
New features, redesigns, third-party price changes, content creation and issues caused by unauthorised changes are out of scope and quoted separately.

4. CLIENT RESPONSIBILITIES
Timely reporting, reasonable access and not modifying the delivered system without informing the Provider.

5. FEES AND RENEWAL
Fees are payable in advance for the agreed term. Renewal is confirmed in writing before the term ends.

6. TERMINATION
Either party may end this agreement with 30 days' written notice; fees for the notice period remain payable.`,
  },
  custom: {
    body: `This document records the understanding between the parties named above in relation to the matter described in this document.

Both parties confirm that the details set out here are accurate and complete to the best of their knowledge, and that any changes will be made in writing and acknowledged by both parties.

Nothing in this document creates a partnership, joint venture or employment relationship between the parties, and neither party may bind the other without prior written consent.`,
  },
};

export const templateBodyFor = (docType: any) => (DOC_TEMPLATES as Record<string, any>)[docType]?.body || DOC_TEMPLATES.custom.body;

/** True when the body is empty or is one of the untouched templates. */
export const isTemplateBody = (value: any) => {
  const body = String(value || "").trim();
  if (!body) return true;
  return Object.values(DOC_TEMPLATES).some((template) => template.body.trim() === body);
};

export const AGREEMENT_TYPES = ["agreement", "nda", "sow", "maintenance", "certificate", "handover", "custom"];