import { useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Banknote, Plus } from "lucide-react";
import { toast } from "sonner";
import EmptyState from "@/components/common/EmptyState";
import PageHeader from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { usePermissions } from "@/lib/permissions";
import {
  createSalaryPayment,
  fetchSalaryPayments,
  setSalaryPaymentStatus,
} from "@/lib/workforce";
import { fetchUsers } from "@/lib/db";

export const Route = createFileRoute("/_authed/salary")({
  head: () => ({ meta: [{ title: "Salary · WorkManager" }] }),
  component: SalaryPage,
});

function SalaryPage() {
  const { canManageTeam } = usePermissions();
  const queryClient = useQueryClient();
  const [memberId, setMemberId] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("INR");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const payments = useQuery({
    queryKey: ["salary-payments"],
    queryFn: fetchSalaryPayments,
    enabled: canManageTeam,
  });
  const team = useQuery({
    queryKey: ["salary-team"],
    queryFn: fetchUsers,
    enabled: canManageTeam,
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, paid }: { id: string; paid: boolean }) => setSalaryPaymentStatus(id, paid),
    onSuccess: async () => {
      toast.success("Salary payment status updated");
      await queryClient.invalidateQueries({ queryKey: ["salary-payments"] });
    },
    onError: (error) => toast.error(error.message || "Could not update payment status."),
  });

  const save = async (event: FormEvent) => {
    event.preventDefault();
    const member = (team.data || []).find((item: any) => item.id === memberId);
    const numericAmount = Number(amount);
    if (!member) {
      toast.error("Choose an active team member.");
      return;
    }
    if (!periodStart || !periodEnd || periodEnd < periodStart) {
      toast.error("Choose a valid salary period.");
      return;
    }
    if (!Number.isFinite(numericAmount) || numericAmount < 0) {
      toast.error("Enter a valid non-negative salary amount.");
      return;
    }
    setSaving(true);
    try {
      await createSalaryPayment({
        memberId: member.id,
        memberEmail: member.email,
        memberName: member.full_name || "",
        periodStart,
        periodEnd,
        amount: numericAmount,
        currency,
        notes,
      });
      toast.success("Salary record created");
      setAmount("");
      setNotes("");
      await queryClient.invalidateQueries({ queryKey: ["salary-payments"] });
    } catch (error: any) {
      toast.error(error instanceof Error ? error.message : "Could not create the salary record.");
    } finally {
      setSaving(false);
    }
  };

  if (!canManageTeam) {
    return (
      <EmptyState
        icon={Banknote}
        title="Admin access required"
        description="Salary and payment records are visible only to workspace admins."
      />
    );
  }

  const recipients = (team.data || []).filter(
    (member: any) => ["leader", "member"].includes(member.role) && member.account_status === "approved" && member.team_status === "active",
  );

  return (
    <div>
      <PageHeader
        title="Salary & payment status"
        description="Private manual records for pay periods and whether each salary has been paid. No money is transferred."
      />

      {team.isError && (
        <p role="alert" className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          Could not load team members: {team.error instanceof Error ? team.error.message : "Unknown error."}
        </p>
      )}

      <form onSubmit={save} className="surface mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1.5">
          <Label>Team member</Label>
          <Select value={memberId} onValueChange={setMemberId}>
            <SelectTrigger><SelectValue placeholder="Choose a member" /></SelectTrigger>
            <SelectContent>
              {recipients.map((member: any) => (
                <SelectItem key={member.id} value={member.id}>{member.full_name || member.email}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="salary-period-start">Period starts</Label>
          <Input id="salary-period-start" type="date" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="salary-period-end">Period ends</Label>
          <Input id="salary-period-end" type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="salary-amount">Amount</Label>
          <Input id="salary-amount" type="number" min="0" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="salary-currency">Currency code</Label>
          <Input id="salary-currency" value={currency} onChange={(event) => setCurrency(event.target.value.toUpperCase())} minLength={3} maxLength={3} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="salary-notes">Notes (optional)</Label>
          <Input id="salary-notes" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={1000} />
        </div>
        <div className="sm:col-span-2 lg:col-span-3">
          <Button type="submit" disabled={saving || !memberId}>
            <Plus className="mr-1.5 h-4 w-4" /> {saving ? "Saving…" : "Add salary record"}
          </Button>
        </div>
      </form>

      {payments.isLoading ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : payments.isError ? (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          Could not load salary records: {payments.error.message}
        </p>
      ) : payments.data?.length ? (
        <div className="surface divide-y divide-border/70">
          {payments.data.map((payment) => (
            <div key={payment.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{payment.member_name || payment.member_email}</p>
                <p className="text-xs text-muted-foreground">
                  {payment.period_start} – {payment.period_end} · {payment.currency} {Number(payment.amount).toLocaleString()}
                </p>
                {payment.notes && <p className="mt-1 text-xs text-muted-foreground">{payment.notes}</p>}
              </div>
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${payment.status === "paid" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                  {payment.status === "paid" ? `Paid ${payment.paid_at}` : "Due"}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={statusMutation.isPending}
                  onClick={() => statusMutation.mutate({ id: payment.id, paid: payment.status !== "paid" })}
                >
                  {payment.status === "paid" ? "Mark due" : "Mark paid"}
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState icon={Banknote} title="No salary records yet" description="Add a pay-period record to track its due or paid status." />
      )}
      <p className="mt-3 text-xs text-muted-foreground">
        Only admins can view these records. They are operational records, not payroll advice or bank transactions.
      </p>
    </div>
  );
}
