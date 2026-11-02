export const CLIENT_STATUS = {
  lead: { label: "Lead", className: "bg-amber-50 text-amber-700 border-amber-200" },
  active: { label: "Active", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  inactive: { label: "Inactive", className: "bg-slate-100 text-slate-600 border-slate-200" },
  archived: { label: "Archived", className: "bg-slate-100 text-slate-500 border-slate-200" },
};

export const CLIENT_TYPES = [
  { value: "business", label: "Business" },
  { value: "individual", label: "Individual" },
];

export const CLIENT_SOURCES = [
  { value: "referral", label: "Referral" },
  { value: "website", label: "Website" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "instagram", label: "Instagram" },
  { value: "cold_outreach", label: "Cold outreach" },
  { value: "repeat", label: "Repeat client" },
  { value: "other", label: "Other" },
];

export const PROJECT_STATUS = {
  lead: { label: "Lead", className: "bg-slate-100 text-slate-600 border-slate-200" },
  quotation_sent: { label: "Quotation sent", className: "bg-blue-50 text-blue-700 border-blue-200" },
  awaiting_advance: { label: "Awaiting advance", className: "bg-amber-50 text-amber-700 border-amber-200" },
  not_started: { label: "Not started", className: "bg-slate-100 text-slate-600 border-slate-200" },
  in_progress: { label: "In progress", className: "bg-primary/10 text-primary border-primary/20" },
  on_hold: { label: "On hold", className: "bg-orange-50 text-orange-700 border-orange-200" },
  under_review: { label: "Under review", className: "bg-[hsl(var(--brand-violet)/0.12)] text-[hsl(var(--brand-violet))] border-violet-200" },
  completed: { label: "Completed", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  delivered: { label: "Delivered", className: "bg-teal-50 text-teal-700 border-teal-200" },
  cancelled: { label: "Cancelled", className: "bg-rose-50 text-rose-700 border-rose-200" },
};

export const PROJECT_STATUS_ORDER = [
  "lead",
  "quotation_sent",
  "awaiting_advance",
  "not_started",
  "in_progress",
  "on_hold",
  "under_review",
  "completed",
  "delivered",
  "cancelled",
];

export const ACTIVE_PROJECT_STATUSES = ["in_progress", "under_review", "awaiting_advance", "not_started", "quotation_sent"];

export const SERVICE_CATEGORIES = [
  { value: "web_development", label: "Web development" },
  { value: "ai_integration", label: "AI integration" },
  { value: "chatbot", label: "Chatbot / assistant" },
  { value: "ecommerce", label: "E-commerce" },
  { value: "maintenance", label: "Maintenance" },
  { value: "branding", label: "Branding & design" },
  { value: "consulting", label: "Consulting" },
  { value: "other", label: "Other" },
];

export const PRIORITY = {
  low: { label: "Low", className: "bg-slate-100 text-slate-600 border-slate-200" },
  medium: { label: "Medium", className: "bg-blue-50 text-blue-700 border-blue-200" },
  high: { label: "High", className: "bg-amber-50 text-amber-700 border-amber-200" },
  urgent: { label: "Urgent", className: "bg-rose-50 text-rose-700 border-rose-200" },
};

export const PRIORITY_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

export const TASK_STATUS = {
  todo: { label: "To do", className: "bg-slate-100 text-slate-600 border-slate-200" },
  in_progress: { label: "In progress", className: "bg-primary/10 text-primary border-primary/20" },
  waiting: { label: "Waiting", className: "bg-amber-50 text-amber-700 border-amber-200" },
  completed: { label: "Completed", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  cancelled: { label: "Cancelled", className: "bg-rose-50 text-rose-700 border-rose-200" },
};

export const TASK_STATUS_OPTIONS = [
  { value: "todo", label: "To do" },
  { value: "in_progress", label: "In progress" },
  { value: "waiting", label: "Waiting" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

export const PAYMENT_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "upi", label: "UPI" },
  { value: "card", label: "Card" },
  { value: "gateway", label: "Payment gateway" },
  { value: "other", label: "Other" },
];

export const PAYMENT_METHOD_LABELS = Object.fromEntries(PAYMENT_METHODS.map((m) => [m.value, m.label]));

export const PAYMENT_STATUS = {
  received: { label: "Received", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  pending: { label: "Pending", className: "bg-amber-50 text-amber-700 border-amber-200" },
  refunded: { label: "Refund", className: "bg-rose-50 text-rose-700 border-rose-200" },
  adjustment: { label: "Adjustment", className: "bg-slate-100 text-slate-600 border-slate-200" },
};

export const EXPENSE_CATEGORIES = [
  { value: "hosting", label: "Hosting" },
  { value: "domain", label: "Domain" },
  { value: "software", label: "Software" },
  { value: "api_usage", label: "API usage" },
  { value: "infrastructure", label: "Infrastructure" },
  { value: "marketing", label: "Marketing" },
  { value: "hardware", label: "Hardware" },
  { value: "internet", label: "Internet" },
  { value: "travel", label: "Travel" },
  { value: "office", label: "Office" },
  { value: "contractor", label: "Contractor" },
  { value: "other", label: "Other" },
];

export const EXPENSE_CATEGORY_LABELS = Object.fromEntries(EXPENSE_CATEGORIES.map((c) => [c.value, c.label]));

export const EXPENSE_STATUS = {
  paid: { label: "Paid", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  pending: { label: "Pending", className: "bg-amber-50 text-amber-700 border-amber-200" },
  reimbursed: { label: "Reimbursed", className: "bg-blue-50 text-blue-700 border-blue-200" },
};

export const EXPENSE_STATUS_OPTIONS = [
  { value: "paid", label: "Paid" },
  { value: "pending", label: "Pending" },
  { value: "reimbursed", label: "Reimbursed" },
];

export const DATE_RANGES = [
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "last_3", label: "Last 3 months" },
  { value: "last_6", label: "Last 6 months" },
  { value: "this_year", label: "This year" },
  { value: "all", label: "All time" },
  { value: "custom", label: "Custom range" },
];

/** Inclusive date bounds for a preset or a custom range. */
export function resolveRange(preset: any, from: any, to: any) {
  const now = new Date();
  const iso = (d: any) => d.toISOString().slice(0, 10);
  const startOfMonth = (d: any) => new Date(d.getFullYear(), d.getMonth(), 1);
  switch (preset) {
    case "this_month":
      return { from: iso(startOfMonth(now)), to: iso(now) };
    case "last_month": {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: iso(start), to: iso(end) };
    }
    case "last_3":
      return { from: iso(new Date(now.getFullYear(), now.getMonth() - 2, 1)), to: iso(now) };
    case "last_6":
      return { from: iso(new Date(now.getFullYear(), now.getMonth() - 5, 1)), to: iso(now) };
    case "this_year":
      return { from: iso(new Date(now.getFullYear(), 0, 1)), to: iso(now) };
    case "custom":
      return { from: from || "", to: to || "" };
    default:
      return { from: "", to: "" };
  }
}

export const inRange = (dateValue: any, range: any) => {
  if (!dateValue) return false;
  const day = String(dateValue).slice(0, 10);
  if (range.from && day < range.from) return false;
  if (range.to && day > range.to) return false;
  return true;
};