const currency = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const amountFormat = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export const num = (value: any) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

export const round2 = (value: any) => Math.round((num(value) + Number.EPSILON) * 100) / 100;

export const inr = (value: any) => currency.format(num(value));

export const amount = (value: any) => amountFormat.format(num(value));

export const fmtDate = (value: any) => {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
};

export const fmtDateLong = (value: any) => {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
};

export const fmtDateTime = (value: any) => {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });
};

export const isoDate = (date = new Date()) => date.toISOString().slice(0, 10);

export const monthKey = (value: any) => {
  const d = value ? new Date(value) : new Date();
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }).slice(0, 7);
};

export const monthLabel = (key: any) => {
  const [year, month] = String(key).split("-");
  if (!year || !month) return key;
  const d = new Date(Number(year), Number(month) - 1, 1);
  return d.toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
};

export const daysUntil = (value: any) => {
  if (!value) return null;
  const target = new Date(`${String(value).slice(0, 10)}T00:00:00+05:30`);
  const now = new Date();
  const today = new Date(now.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }) + "T00:00:00+05:30");
  if (Number.isNaN(target.getTime())) return null;
  return Math.round((target.getTime() - today.getTime()) / 86400000);
};

export const pct = (part: any, total: any) => (num(total) === 0 ? 0 : Math.round((num(part) / num(total)) * 100));

export const initials = (name: any) =>
  String(name || "?")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

export const toCsv = (rows: any, columns: any) => {
  const escape = (value: any) => {
    const text = value === null || value === undefined ? "" : String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const header = columns.map((c: any) => escape(c.label)).join(",");
  const body = rows.map((row: any) => columns.map((c: any) => escape(c.value(row))).join(",")).join("\n");
  return `${header}\n${body}`;
};

export const downloadCsv = (filename: any, csv: any) => {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};