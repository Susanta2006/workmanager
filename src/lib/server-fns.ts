import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireUser } from "@/lib/auth-middleware";

export const getServerInfo = createServerFn({ method: "GET" }).handler(async () => ({
  renderedAt: new Date().toISOString(),
}));

const PREFIXES = {
  quotation: "QUO",
  invoice: "INV",
  receipt: "REC",
  agreement: "AGR",
  nda: "AGR",
  sow: "AGR",
  proposal: "QUO",
  change_request: "QUO",
  certificate: "AGR",
  handover: "AGR",
  maintenance: "AGR",
  custom: "DOC",
};

const asRows = (result: any) => (Array.isArray(result) ? result : result?.items ?? []);

/**
 * Creates a document with a number allocated on the server: PREFIX-YEAR-0001, sequential per
 * document type and never reused. Uses the service-role client so the counter and the
 * number check are not affected by the caller's row-level rules. The caller is authenticated first.
 */
export const createDocument = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(z.object({ doc: z.record(z.string(), z.any()) }))
  .handler(async ({ data, context }) => {
    const { getServiceSupabase } = await import("@/lib/supabase.server");
    const { createEntities } = await import("@/api/entities");
    const db = createEntities(getServiceSupabase(), context.user.organizationId);

    const input = data.doc || {};
    const docType = (PREFIXES as Record<string, any>)[input.doc_type] ? input.doc_type : "quotation";
    const prefix = (PREFIXES as Record<string, any>)[docType];
    const year = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }).slice(0, 4);
    const linkedProject = input.project_id ? await db.entities.Project.get(String(input.project_id)) : null;
    if (input.project_id && !linkedProject) throw new Error("The selected project could not be found.");
    const projectSegment = linkedProject?.project_code
      ? String(linkedProject.project_code).replace(/[^A-Za-z0-9-]/g, "").toUpperCase()
      : "";
    const scopePrefix = projectSegment ? `${prefix}-${projectSegment}-${year}` : `${prefix}-${year}`;
    const key = `${scopePrefix}:${docType}`;

    const [counter, existing] = await Promise.all([
      db.entities.DocCounter.filter({ key })
        .then((rows) => asRows(rows)[0] || null)
        .catch(() => null),
      db.entities.Document.filter({ doc_type: docType }, { limit: 1000 }),
    ]);
    const pattern = new RegExp(`^${scopePrefix}-(\\d+)$`);
    let highest = Number(counter?.value || 0);
    asRows(existing).forEach((row: any) => {
      const found = pattern.exec(row.doc_number || "");
      if (found) highest = Math.max(highest, Number(found[1]));
    });

    for (let attempt = 1; attempt <= 10; attempt += 1) {
      const value = highest + attempt;
      const docNumber = `${scopePrefix}-${String(value).padStart(4, "0")}`;
      const clash = asRows(await db.entities.Document.filter({ doc_number: docNumber }, { limit: 1 }));
      if (clash.length) continue;

      const payload: Record<string, any> = { ...input, doc_type: docType, doc_number: docNumber, currency: input.currency || "INR" };
    if (["agreement", "nda", "sow", "maintenance", "certificate", "handover", "custom"].includes(docType) && payload.status !== "draft") {
      const [client, settingsRows, milestones] = await Promise.all([
        payload.client_id ? db.entities.Client.get(String(payload.client_id)) : Promise.resolve(null),
        db.entities.OrgSettings.list({ limit: 1 }),
        docType === "sow" && linkedProject
          ? db.entities.Milestone.filter({ project_id: String(linkedProject.id) }, { limit: 1000 })
          : Promise.resolve([]),
      ]);
      const settings = asRows(settingsRows)[0] || {};
      const { data: organization } = await getServiceSupabase()
        .from("organizations")
        .select("name")
        .eq("id", context.user.organizationId)
        .maybeSingle();
      if (linkedProject) {
        payload.project_reference_snapshot = {
          id: linkedProject.id,
          title: linkedProject.title || "",
          project_code: linkedProject.project_code || "",
          start_date: linkedProject.start_date || "",
          deadline: linkedProject.deadline || "",
        };
      }
      if (docType === "sow") {
        if (linkedProject) {
          const { milestoneSnapshot } = await import("@/lib/milestones");
          payload.project_milestones_snapshot = milestoneSnapshot(asRows(milestones), String(linkedProject.id));
        } else {
          payload.project_milestones_snapshot = [];
          delete payload.project_reference_snapshot;
        }
      }
      payload.client_snapshot = client ? {
        id: client.id,
        name: client.name || "",
        legal_name: client.legal_name || client.name || "",
        authorised_signatory_name: input.client_authorised_signatory_name || client.authorised_signatory_name || "",
        contact_person: client.contact_person || "",
        email: client.email || "",
        phone: client.phone || "",
        billing_address: client.billing_address || "",
        tax_id: client.tax_id || "",
      } : null;
      payload.organization_snapshot = {
        company_name: organization?.name || settings.company_name || "",
        signature_name: settings.signature_name || "",
        signature_uri: settings.signature_uri || "",
        logo_url: settings.logo_url || "",
        tagline: settings.tagline || "",
        address: settings.address || "",
        email: settings.email || "",
        phone: settings.phone || "",
        website: settings.website || "",
        udyam_number: settings.udyam_number || "",
        gstin: settings.gstin || "",
        governing_law: settings.governing_law || "",
        jurisdiction_city: settings.jurisdiction_city || "",
        jurisdiction_state: settings.jurisdiction_state || "",
        jurisdiction_country: settings.jurisdiction_country || "",
        bank_details: settings.bank_details || "",
        payment_instructions: settings.payment_instructions || "",
        default_terms: settings.default_terms || "",
        default_footer: settings.default_footer || "",
      };
      payload.document_issued_at = new Date().toISOString();
      payload.revision_number = Number(payload.revision_number || 1);
      payload.revision_date = payload.revision_date || payload.issue_date || new Date().toISOString().slice(0, 10);
    }
      delete payload.id;
      delete payload.created_by_id;
      delete payload.created_date;
      delete payload.updated_date;
      const created = await db.entities.Document.create(payload);
      try {
        if (counter) await db.entities.DocCounter.update(counter.id, { value });
        else await db.entities.DocCounter.create({ key, value });
      } catch {
        // The number is already on the document; the counter is only a shortcut.
      }
      return created;
    }

    throw new Error("Could not allocate a unique document number. Please try again.");
  });
