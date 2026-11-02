import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  Plug,
  Save,
  Bell,
  Upload,
  PenTool,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { backend } from "@/api/backend";
import { logActivity } from "@/lib/db";
import { useAuth } from "@/lib/AuthContext";
import { usePermissions } from "@/lib/permissions";
import { useOrgSettings } from "@/lib/org-settings";
import { convertSignature, SIGNATURE_INKS } from "@/lib/signature";
import PrivateImage from "@/components/common/PrivateImage";
import PageHeader from "@/components/common/PageHeader";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import { requestAccountDeletion } from "@/lib/account";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  TextAreaField,
  TextField,
  NumberField,
} from "@/components/common/FormFields";

export const Route = createFileRoute("/_authed/settings")({
  head: () => ({ meta: [{ title: "Settings · WorkManager" }] }),
  component: SettingsPage,
});

const BUSINESS_TYPES = [
  { value: "solo", label: "Solo — only the admin works in this workspace" },
  { value: "team", label: "Team — admins, leaders and members" },
];

function SettingsPage() {
  const { user } = useAuth();
  const { settings, record, isLoading, refetch } = useOrgSettings();
  const { canManageSettings } = usePermissions();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(settings);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState("");
  const [ink, setInk] = useState("black");

  useEffect(() => {
    setForm(settings);
    setInk(settings.signature_ink || "black");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record?.id, isLoading]);

  const set = (key: any) => (value: any) =>
    setForm((prev: any) => ({ ...prev, [key]: value }));

  const save = async () => {
    setSaving(true);
    try {
      // The company name is fixed at registration, so it is never written from this form.
      const { company_name: _fixedName, ...editable } = form as Record<string, unknown>;
      const payload = {
        ...editable,
        default_tax_rate: Number(form.default_tax_rate || 0),
        reminder_lead_days: Number(form.reminder_lead_days || 3),
        signature_ink: ink,
      };
      if (record?.id)
        await backend.entities.OrgSettings.update(record.id, payload);
      else await backend.entities.OrgSettings.create(payload);
      await logActivity({
        user,
        action: "Settings changed",
        entityType: "OrgSettings",
        entityId: record?.id || "",
        label: form.company_name,
      });
      toast.success("Settings saved");
      await refetch();
      queryClient.invalidateQueries({ queryKey: ["org-settings"] });
    } catch (error: any) {
      toast.error(error?.message || "Could not save settings.");
    } finally {
      setSaving(false);
    }
  };

  const uploadLogo = async (event: any) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading("logo");
    try {
      const { file_url } = await backend.files.uploadPublic({
        file,
      });
      set("logo_url")(file_url);
      toast.success("Logo uploaded — remember to save");
    } catch (error: any) {
      toast.error(error?.message || "Could not upload the logo.");
    } finally {
      setUploading("");
    }
  };

  const uploadSignature = async (event: any) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading("signature");
    try {
      const converted = await convertSignature(file, ink);
      const { file_uri } = await backend.files.uploadPrivate({
        file: converted,
      });
      set("signature_uri")(file_uri);
      set("signature_ink")(ink);
      toast.success(
        `Signature cleaned up in ${ink === "blue" ? "blue" : "black"} ink — remember to save`,
      );
    } catch (error: any) {
      toast.error(error?.message || "Could not process that signature.");
    } finally {
      setUploading("");
    }
  };

  if (isLoading)
    return <div className="h-[400px] animate-pulse rounded-xl bg-slate-100" />;

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Company identity, signature, business type and integrations."
      >
        <Button
          size="sm"
          variant="outline"
          onClick={() => { window.location.href = "/passcode?mode=change"; }}
        >
          Change passcode
        </Button>
        <Button
          size="sm"
          onClick={save}
          disabled={saving || !canManageSettings}
        >
          <Save className="mr-1.5 h-3.5 w-3.5" />{" "}
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </PageHeader>

      {!canManageSettings && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[12px] text-amber-800">
          You can view these settings, but only the admin can change them.
        </div>
      )}

      <Tabs defaultValue="company">
        <TabsList className="mb-3 flex h-auto w-full flex-wrap justify-start gap-1 bg-transparent p-0">
          {[
            { value: "company", label: "Company profile", icon: Building2 },
            { value: "signature", label: "Signature", icon: PenTool },
            { value: "notifications", label: "Notifications", icon: Bell },
            { value: "integrations", label: "Integrations", icon: Plug },
          ].map((tab) => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              className="flex items-center gap-1.5 rounded-lg border border-transparent px-3 py-1.5 text-[12.5px] data-[state=active]:border-border data-[state=active]:bg-card data-[state=active]:shadow-sm"
            >
              <tab.icon className="h-3.5 w-3.5" /> {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="company">
          <div className="surface space-y-4 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-xl border border-border bg-white">
                {form.logo_url ? (
                  <img
                    src={form.logo_url}
                    alt="Company logo"
                    className="h-full w-full object-contain p-1"
                  />
                ) : (
                  <Building2 className="h-6 w-6 text-slate-300" />
                )}
              </div>
              <div>
                <Label className="mb-1.5 block text-[12px] font-medium text-slate-600">
                  Company logo
                </Label>
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-1.5 text-[12px] hover:bg-slate-50">
                  <Upload className="h-3.5 w-3.5" />{" "}
                  {uploading === "logo" ? "Uploading…" : "Upload logo"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={uploadLogo}
                    disabled={!canManageSettings || uploading === "logo"}
                  />
                </label>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  PNG or SVG works best. Appears on documents and in the
                  sidebar.
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <TextField
                label="Company name"
                value={form.company_name}
                onChange={() => undefined}
                hint="Set when the company was registered. It cannot be changed here."
                className="sm:col-span-2"
                disabled
              />
              <TextField
                label="Tagline"
                value={form.tagline}
                onChange={set("tagline")}
                className="sm:col-span-2"
              />
              <div className="sm:col-span-2">
                <p className="mb-1 text-[12px] font-medium text-slate-600">
                  Business type
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {BUSINESS_TYPES.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => set("business_type")(option.value)}
                      disabled={!canManageSettings}
                      className={`rounded-lg border px-3 py-2 text-left text-[12px] transition-colors ${
                        (form.business_type || "solo") === option.value
                          ? "border-primary bg-accent text-accent-foreground"
                          : "border-border bg-white text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Solo workspaces have only the admin. Team workspaces add
                  members, and only the admin can approve them.
                </p>
              </div>
              <TextField
                label="Business email"
                value={form.email}
                onChange={set("email")}
              />
              <TextField
                label="Phone"
                value={form.phone}
                onChange={set("phone")}
              />
              <TextField
                label="Website"
                value={form.website}
                onChange={set("website")}
              />
              <TextField
                label="Portfolio"
                value={form.portfolio}
                onChange={set("portfolio")}
              />
              <TextAreaField
                label="Registered address"
                value={form.address}
                onChange={set("address")}
                rows={3}
                className="sm:col-span-2"
              />
              <TextField
                label="Registration Number"
                value={form.udyam_number}
                onChange={set("udyam_number")}
              />
              <TextField
                label="PAN (optional)"
                value={form.pan}
                onChange={set("pan")}
              />
              <TextField
                label="GSTIN (optional)"
                value={form.gstin}
                onChange={set("gstin")}
              />
              <TextField
                label="Authorised signatory"
                value={form.signature_name}
                onChange={set("signature_name")}
              />
              <TextAreaField
                label="Bank details"
                value={form.bank_details}
                onChange={set("bank_details")}
                rows={3}
                className="sm:col-span-2"
                hint="Leave blank if you share bank details on request — nothing is invented for you."
              />
              <TextAreaField
                label="Payment instructions"
                value={form.payment_instructions}
                onChange={set("payment_instructions")}
                rows={3}
                className="sm:col-span-2"
              />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="signature">
          <div className="surface space-y-4 p-4">
            <div>
              <p className="text-[12.5px] font-medium">Signature image</p>
              <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted-foreground">
                Upload a photo or scan of your signature under 5 MB. It is
                converted to a clean white background with crisp ink, so it
                prints like a real signature on every document.
              </p>
            </div>

            <div className="flex flex-wrap items-end gap-3">
              <div>
                <p className="mb-1 text-[12px] font-medium text-slate-600">
                  Ink colour
                </p>
                <div className="flex gap-2">
                  {Object.keys(SIGNATURE_INKS).map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setInk(key)}
                      disabled={!canManageSettings}
                      className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[12px] capitalize ${
                        ink === key
                          ? "border-primary bg-accent text-accent-foreground"
                          : "border-border bg-white text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ background: (SIGNATURE_INKS as Record<string, any>)[key] }}
                      />
                      {key}
                    </button>
                  ))}
                </div>
              </div>
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-2 text-[12px] hover:bg-slate-50">
                <Upload className="h-3.5 w-3.5" />{" "}
                {uploading === "signature" ? "Processing…" : "Upload signature"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={uploadSignature}
                  disabled={!canManageSettings || uploading === "signature"}
                />
              </label>
              {form.signature_uri && canManageSettings && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-rose-600 hover:text-rose-700"
                  onClick={() => set("signature_uri")("")}
                >
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Remove
                </Button>
              )}
            </div>

            <div className="flex min-h-[110px] items-center justify-center rounded-xl border border-dashed border-border bg-white p-4">
              {form.signature_uri ? (
                <PrivateImage
                  fileUri={form.signature_uri}
                  alt="Signature"
                  className="max-h-[90px] w-auto object-contain"
                />
              ) : (
                <p className="text-[12px] text-muted-foreground">
                  No signature uploaded yet — documents will show the signatory
                  name only.
                </p>
              )}
            </div>

            <div className="rounded-lg border border-border bg-slate-50 p-3 text-[11.5px] leading-relaxed text-slate-600">
              Uploaded in {form.signature_ink === "blue" ? "blue" : "black"}{" "}
              ink. The signature is stored privately (not a public link) and
              appears above the authorised signatory line on quotations,
              invoices, receipts and agreements.
            </div>
          </div>
        </TabsContent>

        <TabsContent value="notifications">
          <div className="surface space-y-4 p-4">
            <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
              <div>
                <p className="text-[12.5px] font-medium">In-app notifications</p>
                <p className="text-[11px] text-muted-foreground">
                  Task assignments, progress updates, and workspace events appear in the notification center.
                </p>
              </div>
              <span className="text-xs font-medium text-emerald-700">Enabled</span>
            </div>
            <NumberField
              label="Reminder lead time (days)"
              value={form.reminder_lead_days}
              onChange={set("reminder_lead_days")}
              hint="Days before a due date that an item is flagged as due soon."
            />
          </div>
        </TabsContent>

        <TabsContent value="integrations">
          <div className="surface space-y-4 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField
                label="WhatsApp Business API"
                value={form.integration_whatsapp}
                onChange={set("integration_whatsapp")}
                placeholder="Optional"
                hint={form.integration_whatsapp ? "Recorded" : "Not configured"}
              />
              <TextField
                label="Calendar sync"
                value={form.integration_calendar}
                onChange={set("integration_calendar")}
                placeholder="Optional"
                hint={form.integration_calendar ? "Recorded" : "Not configured"}
              />
              <TextField
                label="Outgoing webhook"
                value={form.integration_webhook}
                onChange={set("integration_webhook")}
                placeholder="https://…"
                hint={form.integration_webhook ? "Recorded" : "Not configured"}
              />
            </div>
            <div className="grid gap-2 text-[11.5px] text-slate-600 sm:grid-cols-2">
              {[
                ["WhatsApp messages", form.integration_whatsapp],
                ["Calendar events", form.integration_calendar],
                ["Outgoing webhooks", form.integration_webhook],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="flex items-center justify-between rounded-lg border border-border px-3 py-2"
                >
                  <span>{label}</span>
                  <span
                    className={`inline-flex items-center gap-1.5 text-[11px] font-medium ${value ? "text-emerald-700" : "text-slate-400"}`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${value ? "bg-emerald-500" : "bg-slate-300"}`}
                    />
                    {value ? "Recorded" : "Not configured"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <AccountDeletionSection />
    </div>
  );
}

function AccountDeletionSection() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const confirmDelete = async () => {
    setBusy(true);
    try {
      await requestAccountDeletion();
      toast.success("Deletion request received. Demo mode: nothing was deleted.");
      setOpen(false);
    } catch (error: any) {
      toast.error(error?.message || "Could not process the request.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      aria-labelledby="delete-account-heading"
      className="surface mt-6 space-y-3 border-destructive/40 p-4"
    >
      <div>
        <h2
          id="delete-account-heading"
          className="font-heading text-[15px] font-semibold text-destructive"
        >
          Delete account
        </h2>
        <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
          Deleting your account signs you out and removes your login and personal
          profile. You lose access to this workspace. This cannot be undone.
        </p>
      </div>
      <Button variant="destructive" size="sm" onClick={() => setOpen(true)}>
        <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete my account
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Delete your account?"
        description="You will be signed out immediately and lose access to this workspace. Your personal login and profile will be removed, and records only you created may be deleted. This action cannot be undone."
        confirmLabel="Yes, delete my account"
        destructive
        busy={busy}
        onConfirm={confirmDelete}
      />
    </section>
  );
}
