import { backend } from "@/api/backend";
import { getSupabase } from "@/lib/supabase";
import { num } from "@/lib/format";
import { buildLedger, documentFinancials, resolveStatus } from "@/lib/doc-finance";
import { toast } from "sonner";

const PAGE_SIZE = 1000;
const MAX_ROWS = 100000;

function sortRows(rows: any[], sort: string | undefined) {
  if (!sort || sort === "-created_date" || sort === "created_date") return rows;
  const desc = sort.startsWith("-");
  const field = desc ? sort.slice(1) : sort;
  return [...rows].sort((a, b) => {
    const x = a?.[field];
    const y = b?.[field];
    if (x == null && y == null) return 0;
    if (x == null) return 1;
    if (y == null) return -1;
    const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y));
    return desc ? -c : c;
  });
}

/**
 * Every row of an entity, optionally filtered. Pages through the whole table, so lists,
 * reports and dropdowns never silently stop at a fixed count. Fails loudly past MAX_ROWS.
 */
export async function fetchAll(entityName: any, query: Record<string, any> | null = null, options: { sort?: string } = {}) {
  const entity = backend.entities[entityName];
  if (!entity) throw new Error(`Unknown data type: ${entityName}`);
  const rows: any[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const opts = { limit: PAGE_SIZE, offset, sort: "-created_date" };
    const result = query && Object.keys(query).length ? await entity.filter(query, opts) : await entity.list(opts);
    const items: any[] = Array.isArray(result) ? result : (result?.items ?? []);
    rows.push(...items);
    if (items.length < PAGE_SIZE) break;
    if (rows.length >= MAX_ROWS) {
      throw new Error(`${entityName} has more than ${MAX_ROWS} records. Narrow the list with a filter.`);
    }
  }
  return sortRows(rows, options.sort);
}

/** Team members (profiles). */
export async function fetchUsers() {
  const { data, error } = await getSupabase().rpc("list_team_directory");
  if (error) throw error;
  return data ?? [];
}

export async function fetchOne(entityName: any, id: any) {
  if (!id) return null;
  try {
    return await backend.entities[entityName].get(id);
  } catch (error: any) {
    if (error?.status === 404 || error?.code === "PGRST116") return null;
    throw error;
  }
}

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Highest numeric suffix already used by `field` for values shaped like PREFIX-<n>. */
function highestSuffix(rows: any[], field: string, prefix: string) {
  const pattern = new RegExp(`^${escapeRegExp(prefix)}-(\\d+)$`);
  let highest = 0;
  for (const row of rows) {
    const found = pattern.exec(String(row?.[field] ?? ""));
    if (found) highest = Math.max(highest, Number(found[1]));
  }
  return highest;
}

/**
 * Atomic counter in the database. The first call for a key starts from `seed` (the highest
 * number already in use), and every later call increments it. Two users creating records at the
 * same moment can never receive the same number.
 */
async function nextCounter(key: string, seed: number) {
  const { data, error } = await getSupabase().rpc("next_counter", { p_key: key, p_seed: seed });
  if (error) throw error;
  return Number(data);
}

/** Sequential code such as CL-0007, unique per organisation. */
export async function nextSequence(entityName: any, field: any, prefix: any, width = 4) {
  const rows = await fetchAll(entityName);
  const seed = highestSuffix(rows, field, prefix);
  const value = await nextCounter(`${entityName}:${field}:${prefix}`, seed);
  return `${prefix}-${String(value).padStart(width, "0")}`;
}

/** Document numbers are PREFIX-YEAR-0001, unique per document type and year. */
export async function nextDocNumber(docType: any, prefix: any) {
  const year = Number(new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }).slice(0, 4));
  const rows = await fetchAll("Document", { doc_type: docType });
  const numberPrefix = `${prefix}-${year}`;
  const seed = highestSuffix(rows, "doc_number", numberPrefix);
  const value = await nextCounter(`Document:doc_number:${docType}:${numberPrefix}`, seed);
  return `${numberPrefix}-${String(value).padStart(4, "0")}`;
}

export async function logActivity({ user, action, entityType, entityId, label, details = "" }: any) {
  // Audit writes must never block the user's action; a failure is swallowed on purpose.
  try {
    await backend.entities.ActivityLog.create({
      actor_name: user?.full_name || user?.email || "Workspace",
      actor_email: user?.email || "",
      action,
      entity_type: entityType,
      entity_id: entityId || "",
      entity_label: label || "",
      details: details || "",
    });
  } catch {
    /* ignore audit failures */
  }
}

/** Saves a private in-app notification; failures are visible but do not undo the source action. */
export async function pushNotification({ title, message, type = "system", link = "", userEmail = "", relatedRecordId = "" }: any) {
  try {
    const { data, error: userError } = await getSupabase().auth.getUser();
    if (userError) throw userError;
    const recipient = userEmail || data.user?.email;
    if (!recipient) throw new Error("A signed-in recipient is required for notifications.");
    if (link && (!link.startsWith("/") || link.startsWith("//") || link.includes("\\"))) {
      throw new Error("Notification links must stay inside the workspace.");
    }
    await backend.entities.Notification.create({
      title: String(title).slice(0, 160),
      message: String(message).slice(0, 1000),
      type,
      link,
      user_email: recipient,
      read: false,
      ...(relatedRecordId ? { related_record_id: relatedRecordId } : {}),
    });
    return true;
  } catch (error: any) {
    console.error("Could not save an in-app notification.", error);
    toast.error("The workspace change was saved, but its notification could not be delivered.");
    return false;
  }
}

export async function countUnreadNotifications() {
  const { count, error } = await getSupabase()
    .from("records")
    .select("id", { count: "exact", head: true })
    .eq("entity", "Notification")
    .contains("data", { read: false });
  if (error) throw error;
  return count ?? 0;
}

/**
 * Brings every cached document amount back in line with the payment ledger.
 *
 * Pass the payment(s) that changed (the saved one, and the previous version if it was
 * moved or edited). Every document they touch is refreshed, and so is every invoice and
 * receipt of the same project, because project-billed invoices share one received total.
 * Figures come from documentFinancials, the same code the printed paper uses.
 */
export async function syncPaymentBalances(...changed: any[]) {
  return refreshBalances(changed.filter(Boolean), false);
}

/**
 * Checks every document's cached figures against the ledger and fixes any that differ.
 * Runs when the documents list opens, so invoices created before cached figures were kept
 * in step are corrected. Only rows that differ are written. Returns how many were changed.
 */
export async function syncAllBalances() {
  return refreshBalances([], true);
}

async function refreshBalances(records: any[], all: boolean) {
  const [payments, documents, projects] = await Promise.all([
    fetchAll("Payment", null),
    fetchAll("Document", null),
    fetchAll("Project", null),
  ]);
  const ledger = buildLedger(payments, documents);
  const projectsById: Record<string, any> = Object.fromEntries(
    projects.map((project: any) => [project.id, project]),
  );

  const documentIds = new Set<string>();
  const projectIds = new Set<string>();
  for (const record of records) {
    if (record.document_id) documentIds.add(record.document_id);
    if (record.project_id) projectIds.add(record.project_id);
  }
  documentIds.forEach((id) => {
    const projectId = ledger.docsById[id]?.project_id;
    if (projectId) projectIds.add(projectId);
  });

  let changedCount = 0;
  for (const doc of documents) {
    const projectBilledSibling =
      ["invoice", "receipt"].includes(doc.doc_type) && projectIds.has(doc.project_id);
    if (!all && !documentIds.has(doc.id) && !projectBilledSibling) continue;

    const fin = documentFinancials(doc, projectsById[doc.project_id], ledger);
    if (!fin) continue;

    let patch: Record<string, any>;
    if (doc.doc_type === "receipt") {
      // A receipt is a fixed record of one payment. Only its balance is kept current, and only for project receipts.
      if (!fin.billed) continue;
      patch = { balance_due: fin.balance };
    } else {
      patch = {
        amount_paid: fin.received,
        balance_due: fin.balance,
        status: resolveStatus(doc, fin),
      };
      if (fin.billed) patch.total = fin.total;
    }

    const differs = Object.entries(patch).some(([key, value]) =>
      typeof value === "number"
        ? Math.abs(num(doc[key]) - value) > 0.004
        : doc[key] !== value,
    );
    if (differs) {
      await backend.entities.Document.update(doc.id, patch);
      changedCount += 1;
    }
  }
  return changedCount;
}

/** Kept for existing callers: refreshes one document and its project's billed documents. */
export async function recalcDocumentPayments(documentId: any) {
  if (!documentId) return null;
  return syncPaymentBalances({ document_id: documentId });
}
