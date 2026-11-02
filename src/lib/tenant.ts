const COMPANY_STORAGE_KEY = "workmanager-company-name";

export function normalizeCompanyName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export function getSelectedCompanyName() {
  if (typeof window === "undefined") return "";
  return sessionStorage.getItem(COMPANY_STORAGE_KEY) ?? "";
}

export function setSelectedCompanyName(name: string) {
  if (typeof window === "undefined") throw new Error("Company selection is only available in a browser.");
  const normalizedName = name.trim().replace(/\s+/g, " ");
  if (normalizedName.length < 2 || normalizedName.length > 120) {
    throw new Error("Enter a company name between 2 and 120 characters.");
  }
  sessionStorage.setItem(COMPANY_STORAGE_KEY, normalizedName);
}
