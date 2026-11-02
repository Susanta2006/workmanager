import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export function Field({ label, children, hint, className, required }: any) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label className="text-[12px] font-medium text-slate-600">
        {label} {required && <span className="text-rose-500">*</span>}
      </Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function TextField({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  required,
  hint,
  className,
  step,
  disabled = false,
}: any) {
  return (
    <Field label={label} hint={hint} className={className} required={required}>
      <Input
        type={type}
        step={step}
        value={value ?? ""}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 bg-white text-[13px] disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-600"
      />
    </Field>
  );
}

export function NumberField({
  label,
  value,
  onChange,
  placeholder,
  hint,
  className,
  required,
}: any) {
  return (
    <Field label={label} hint={hint} className={className} required={required}>
      <Input
        type="number"
        step="0.01"
        min="0"
        value={value ?? ""}
        placeholder={placeholder}
        onChange={(event) =>
          onChange(event.target.value === "" ? "" : Number(event.target.value))
        }
        className="h-9 bg-white text-[13px]"
      />
    </Field>
  );
}

export function TextAreaField({
  label,
  value,
  onChange,
  placeholder,
  rows = 3,
  hint,
  className,
}: any) {
  return (
    <Field label={label} hint={hint} className={className}>
      <Textarea
        value={value ?? ""}
        rows={rows}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="resize-y bg-white text-[13px]"
      />
    </Field>
  );
}

export function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder = "Select…",
  className,
  hint,
}: any) {
  return (
    <Field label={label} hint={hint} className={className}>
      <Select value={value ?? ""} onValueChange={onChange}>
        <SelectTrigger className="h-9 bg-white text-[13px]">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option: any) => (
            <SelectItem
              key={option.value}
              value={option.value}
              className="text-[13px]"
            >
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

export function FormError({ message }: any) {
  if (!message) return null;
  return (
    <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700">
      {message}
    </p>
  );
}
