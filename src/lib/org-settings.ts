import { useQuery } from "@tanstack/react-query";
import { backend } from "@/api/backend";
import { getSupabase } from "@/lib/supabase";

export const DEFAULT_SETTINGS = {
  company_name: "",
  tagline: "",
  business_type: "solo",
  email: "",
  phone: "",
  website: "",
  portfolio: "",
  address: "",
  udyam_number: "",
  pan: "",
  gstin: "",
  bank_details: "",
  payment_instructions: "",
  logo_url: "",
  signature_name: "",
  signature_uri: "",
  signature_ink: "black",
  quotation_prefix: "QUO",
  invoice_prefix: "INV",
  receipt_prefix: "REC",
  agreement_prefix: "AGR",
  default_tax_rate: 0,
  default_terms: "",
  default_notes: "",
  default_footer: "",
  default_agreement_clauses: "",
  reminder_lead_days: 3,
  integration_whatsapp: "",
  integration_calendar: "",
  integration_webhook: "",
};

export async function loadSettingsRecord() {
  const page = await backend.entities.OrgSettings.list({ limit: 1 });
  const items = page?.items ?? (Array.isArray(page) ? page : []);
  return items[0] || null;
}

/**
 * The company's registered name. Set once at registration and read-only for everyone: the
 * organizations table has no update policy, so this value cannot be changed from the app.
 */
export async function loadOrganizationName() {
  const { data, error } = await getSupabase()
    .from("organizations")
    .select("name")
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.name ?? "";
}

async function loadSettings() {
  const [record, companyName] = await Promise.all([loadSettingsRecord(), loadOrganizationName()]);
  return { record, companyName };
}

export function useOrgSettings() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["org-settings"],
    queryFn: loadSettings,
    staleTime: 60_000,
  });
  const record = data?.record ?? null;
  const companyName = data?.companyName ?? "";
  return {
    record,
    companyName,
    // The registered name always wins over anything stored in the settings record.
    settings: {
      ...DEFAULT_SETTINGS,
      ...(record || {}),
      company_name: companyName || record?.company_name || "",
    },
    isLoading,
    refetch,
  };
}
