import { getSupabase } from "@/lib/supabase";

export type WorkDivision = {
  id: string;
  name: string;
  description: string;
  active: boolean;
};

export async function fetchWorkDivisions(): Promise<WorkDivision[]> {
  const { data, error } = await getSupabase()
    .from("work_divisions")
    .select("id, name, description, active")
    .eq("active", true)
    .order("name");
  if (error) throw error;
  return data ?? [];
}

export async function createWorkDivision(name: string, description = "") {
  const cleanName = name.trim();
  if (!cleanName || cleanName.length > 80) {
    throw new Error("Division names must be between 1 and 80 characters.");
  }
  const { data: userData, error: userError } = await getSupabase().auth.getUser();
  if (userError) throw userError;
  if (!userData.user) throw new Error("Sign in to create a division.");
  const { error } = await getSupabase().from("work_divisions").insert({
    name: cleanName,
    description: description.trim().slice(0, 500),
    created_by: userData.user.id,
  });
  if (error) throw error;
}

export async function setDivisionMembership(
  divisionId: string,
  memberId: string,
  assigned: boolean,
) {
  const supabase = getSupabase();
  const result = assigned
    ? await supabase.from("division_members").upsert(
        { division_id: divisionId, member_id: memberId },
        { onConflict: "division_id,member_id", ignoreDuplicates: true },
      )
    : await supabase
        .from("division_members")
        .delete()
        .eq("division_id", divisionId)
        .eq("member_id", memberId);
  if (result.error) throw result.error;
}

export async function setMyAvailability(isAvailable: boolean) {
  const supabase = getSupabase();
  const { data, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!data.user) throw new Error("Sign in to update availability.");
  const { error } = await supabase
    .from("profiles")
    .update({ is_available: isAvailable })
    .eq("id", data.user.id);
  if (error) throw error;
}

export async function fetchSalaryPayments() {
  const { data, error } = await getSupabase()
    .from("salary_payments")
    .select("*")
    .order("period_end", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createSalaryPayment(input: {
  memberId: string;
  memberEmail: string;
  memberName: string;
  periodStart: string;
  periodEnd: string;
  amount: number;
  currency: string;
  notes: string;
}) {
  const { data, error: userError } = await getSupabase().auth.getUser();
  if (userError) throw userError;
  if (!data.user) throw new Error("Sign in to manage salary records.");
  const { error } = await getSupabase().from("salary_payments").insert({
    member_id: input.memberId,
    member_email: input.memberEmail,
    member_name: input.memberName,
    period_start: input.periodStart,
    period_end: input.periodEnd,
    amount: input.amount,
    currency: input.currency.trim().toUpperCase(),
    notes: input.notes.trim().slice(0, 1000),
    created_by: data.user.id,
  });
  if (error) throw error;
}

export async function setSalaryPaymentStatus(id: string, paid: boolean) {
  const { error } = await getSupabase()
    .from("salary_payments")
    .update({
      status: paid ? "paid" : "due",
      paid_at: paid ? new Date().toISOString().slice(0, 10) : null,
    })
    .eq("id", id);
  if (error) throw error;
}
