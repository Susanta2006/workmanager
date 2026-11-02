import { useMemo, useState } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Save } from "lucide-react";
import { toast } from "sonner";
import { createDocument } from "@/lib/server-fns";
import { fetchAll, logActivity, pushNotification } from "@/lib/db";
import { useAuth } from "@/lib/AuthContext";
import { useOrgSettings } from "@/lib/org-settings";
import { computeTotals, docTypeMeta, emptyItem } from "@/lib/doc-types";
import { templateBodyFor } from "@/lib/doc-templates";
import { inr } from "@/lib/format";
import PageHeader from "@/components/common/PageHeader";
import DocumentForm from "@/components/documents/DocumentForm";
import DocumentPaper from "@/components/documents/DocumentPaper";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchClients } from "@/lib/clients";

export const Route = createFileRoute("/_authed/documents/new")({
  validateSearch: (search: Record<string, unknown>) => ({
    ...(typeof search.client === "string" ? { client: search.client } : {}),
    ...(typeof search.project === "string" ? { project: search.project } : {}),
  }),
  head: () => ({ meta: [{ title: "New document · WorkManager" }] }),
  component: NewDocumentPage,
});

function NewDocumentPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { settings, isLoading: settingsLoading } = useOrgSettings();
  const createDoc = useServerFn(createDocument);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["document-editor-data"],
    queryFn: async () => {
      const [clients, projects] = await Promise.all([
        fetchClients(),
        fetchAll("Project", null),
      ]);
      return { clients, projects };
    },
  });

  const client = (data?.clients || []).find((c: any) => c.id === search.client);
  const project = (data?.projects || []).find((p: any) => p.id === search.project);

  const [form, setForm] = useState(() => ({
    doc_type: "quotation",
    doc_number: "",
    title: "",
    client_id: search.client || "",
    client_name: client?.name || "",
    project_id: search.project || "",
    project_name: project?.title || "",
    issue_date: new Date().toISOString().slice(0, 10),
    due_date: "",
    valid_until: "",
    status: "draft",
    items: [emptyItem()],
    tax_rate: Number(settings.default_tax_rate || 0),
    amount_paid: 0,
    terms: settings.default_terms || "",
    notes: settings.default_notes || "",
    payment_instructions: settings.payment_instructions || "",
    body: templateBodyFor("quotation"),
  }));

  const totals = useMemo(
    () => computeTotals(form.items, form.tax_rate),
    [form.items, form.tax_rate],
  );

  const save = async () => {
    if (!form.client_id) {
      setError("Choose a client from the list.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload = {
        ...form,
        client_name: (data?.clients || []).find((c: any) => c.id === form.client_id)?.name || form.client_name,
        title: form.title || docTypeMeta(form.doc_type).label,
        tax_rate: Number(form.tax_rate || 0),
        ...totals,
        amount_paid: Number(form.amount_paid || 0),
        balance_due: Math.max(0, totals.total - Number(form.amount_paid || 0)),
        currency: "INR",
      };
      delete (payload as any).doc_number;
      const created = await createDoc({ data: { doc: payload } });
      await logActivity({
        user,
        action: "Document generated",
        entityType: "Document",
        entityId: created.id,
        label: `${created.doc_number} · ${inr(created.total)}`,
        details: docTypeMeta(created.doc_type).label,
      });
      await pushNotification({
        title: `${docTypeMeta(created.doc_type).label} created`,
        message: `${created.doc_number} for ${created.client_name || "client"} · ${inr(created.total)}.`,
        type: created.doc_type === "invoice" ? "invoice" : "system",
        link: `/documents/${created.id}`,
        relatedRecordId: created.id,
      });
      toast.success(`Document ${created.doc_number} created`);
      navigate({
        to: "/documents/$documentId",
        params: { documentId: created.id },
      });
    } catch (err: any) {
      setError(err?.message || "Could not save this document.");
    } finally {
      setSaving(false);
    }
  };

  if (isLoading || settingsLoading)
    return <Skeleton className="h-[600px] rounded-xl" />;

  return (
    <div>
      <Link
        to="/documents"
        className="mb-3 inline-flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> All documents
      </Link>

      <PageHeader
        title="New document"
        description="Fill the form, preview the A4 page, then save and print."
      >
        <Button variant="outline" size="sm" asChild>
          <Link to="/documents">Cancel</Link>
        </Button>
        <Button size="sm" onClick={save} disabled={saving}>
          <Save className="mr-1.5 h-3.5 w-3.5" />{" "}
          {saving ? "Saving…" : "Save document"}
        </Button>
      </PageHeader>

      {error && (
        <p className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700">
          {error}
        </p>
      )}

      <div className="surface p-4">
        <DocumentForm form={form} setForm={setForm} settings={settings} />
      </div>

      <div className="mt-4">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Live preview
        </p>
        <div className="overflow-x-auto rounded-xl bg-slate-100 p-3">
          <DocumentPaper
            doc={{
              ...form,
              ...totals,
              balance_due: Math.max(
                0,
                totals.total - Number(form.amount_paid || 0),
              ),
            }}
            client={client}
            project={project}
            settings={settings}
          />
        </div>
      </div>
    </div>
  );
}
