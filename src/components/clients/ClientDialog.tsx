import { useEffect, useState } from "react";
import { toast } from "sonner";
import { backend } from "@/api/backend";
import { useAuth } from "@/lib/AuthContext";
import { logActivity, nextSequence, pushNotification } from "@/lib/db";
import { CLIENT_SOURCES, CLIENT_STATUS, CLIENT_TYPES } from "@/lib/constants";
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
  SelectField,
  TextAreaField,
  TextField,
  FormError,
} from "@/components/common/FormFields";

const emptyForm = {
  name: "",
  legal_name: "",
  authorised_signatory_name: "",
  client_type: "business",
  contact_person: "",
  email: "",
  phone: "",
  whatsapp: "",
  website: "",
  billing_address: "",
  business_address: "",
  tax_id: "",
  source: "referral",
  status: "active",
  notes: "",
};

export default function ClientDialog({ open, onOpenChange, client, onSaved }: any) {
  const { user } = useAuth();
  const [form, setForm] = useState(emptyForm);
  const [tags, setTags] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError("");
    if (client) {
      setForm({ ...emptyForm, ...client, tags: undefined });
      setTags((client.tags || []).join(", "));
    } else {
      setForm(emptyForm);
      setTags("");
    }
  }, [open, client]);

  const set = (key: any) => (value: any) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const submit = async (event: any) => {
    event.preventDefault();
    if (!form.name.trim()) {
      setError("Client name is required.");
      return;
    }
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      setError("Enter a valid email address.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload = {
        ...form,
        name: form.name.trim(),
        tags: tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      };
      let saved;
      if (client?.id) {
        saved = await backend.entities.Client.update(client.id, payload);
        await logActivity({
          user,
          action: "Client updated",
          entityType: "Client",
          entityId: client.id,
          label: saved.name,
        });
        toast.success("Client updated");
      } else {
        const client_code = await nextSequence("Client", "client_code", "CL");
        saved = await backend.entities.Client.create({
          ...payload,
          client_code,
        });
        await logActivity({
          user,
          action: "Client created",
          entityType: "Client",
          entityId: saved.id,
          label: saved.name,
        });
        await pushNotification({
          title: "New client added",
          message: `${saved.name} was added to the client list.`,
          type: "client",
          link: `/clients/${saved.id}`,
          relatedRecordId: saved.id,
        });
        toast.success("Client created");
      }
      onSaved?.(saved);
      onOpenChange(false);
    } catch (err: any) {
      setError(err?.message || "Could not save this client.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-[640px] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading text-lg">
            {client ? "Edit client" : "New client"}
          </DialogTitle>
          <DialogDescription className="text-[12.5px]">
            {client
              ? `Update details for ${client.name}.`
              : "Add a client or a new lead to your workspace."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <FormError message={error} />
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField
              label="Client / organisation name"
              value={form.name}
              onChange={set("name")}
              required
              className="sm:col-span-2"
            />
            <TextField
              label="Legal name (for agreements)"
              value={form.legal_name || ""}
              onChange={set("legal_name")}
              className="sm:col-span-2"
              hint="Leave blank to use the client / organisation name above."
            />
            <TextField
              label="Authorised signatory (for agreements)"
              value={form.authorised_signatory_name || ""}
              onChange={set("authorised_signatory_name")}
              className="sm:col-span-2"
              hint="Enter only a person authorised to execute agreements on behalf of this client. Contact person is not used as a fallback."
            />
            <SelectField
              label="Client type"
              value={form.client_type}
              onChange={set("client_type")}
              options={CLIENT_TYPES}
            />
            <TextField
              label="Contact person"
              value={form.contact_person}
              onChange={set("contact_person")}
            />
            <TextField
              label="Email"
              type="email"
              value={form.email}
              onChange={set("email")}
            />
            <TextField
              label="Phone"
              value={form.phone}
              onChange={set("phone")}
            />
            <TextField
              label="WhatsApp"
              value={form.whatsapp}
              onChange={set("whatsapp")}
            />
            <TextField
              label="Website"
              value={form.website}
              onChange={set("website")}
              placeholder="https://"
            />
            <SelectField
              label="Source"
              value={form.source}
              onChange={set("source")}
              options={CLIENT_SOURCES}
            />
            <SelectField
              label="Status"
              value={form.status}
              onChange={set("status")}
              options={Object.entries(CLIENT_STATUS).map(([value, meta]) => ({
                value,
                label: meta.label,
              }))}
            />
            <TextField
              label="Tax ID / GSTIN (optional)"
              value={form.tax_id}
              onChange={set("tax_id")}
              className="sm:col-span-2"
            />
            <TextAreaField
              label="Billing address"
              value={form.billing_address}
              onChange={set("billing_address")}
              rows={2}
            />
            <TextAreaField
              label="Business address"
              value={form.business_address}
              onChange={set("business_address")}
              rows={2}
            />
            <TextField
              label="Tags"
              value={tags}
              onChange={setTags}
              placeholder="e.g. retainer, priority"
              hint="Separate tags with commas"
              className="sm:col-span-2"
            />
            <TextAreaField
              label="Notes"
              value={form.notes}
              onChange={set("notes")}
              rows={3}
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
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : client ? "Save changes" : "Create client"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
