import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Check, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  createWorkDivision,
  setDivisionMembership,
  setMyAvailability,
  type WorkDivision,
} from "@/lib/workforce";

type DirectoryUser = {
  id: string;
  email: string;
  full_name: string;
  role: string;
  account_status: string;
  team_status: string;
  is_available: boolean;
  division_ids: string[];
};

export function WorkDivisionManager({
  user,
  users,
  divisions,
  canManageTeam,
  canAssignWork,
  loading,
  onChanged,
}: {
  user: DirectoryUser | null;
  users: DirectoryUser[];
  divisions: WorkDivision[];
  canManageTeam: boolean;
  canAssignWork: boolean;
  loading: boolean;
  onChanged: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  const saveDivision = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      await createWorkDivision(name, description);
      setName("");
      setDescription("");
      toast.success("Division created");
      onChanged();
    } catch (error: any) {
      toast.error(error instanceof Error ? error.message : "Could not create the division.");
    } finally {
      setBusy(false);
    }
  };

  const toggleMembership = async (divisionId: string, member: DirectoryUser, assigned: boolean) => {
    try {
      await setDivisionMembership(divisionId, member.id, assigned);
      toast.success("Division assignment updated");
      onChanged();
    } catch (error: any) {
      toast.error(error instanceof Error ? error.message : "Could not update the division assignment.");
    }
  };

  const toggleAvailability = async (available: boolean) => {
    setBusy(true);
    try {
      await setMyAvailability(available);
      toast.success(available ? "You are marked available" : "You are marked unavailable");
      onChanged();
    } catch (error: any) {
      toast.error(error instanceof Error ? error.message : "Could not update your availability.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="surface mb-4 space-y-4 p-4">
      <div>
        <h2 className="font-heading text-sm font-semibold">Work divisions & availability</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Divisions categorize work. Tasks and work packages can be assigned only to available people in that division.
        </p>
      </div>

      {user && (
        <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
          <div>
            <p className="text-sm font-medium">My availability</p>
            <p className="text-xs text-muted-foreground">
              {user.is_available ? "Available for assignments" : "Unavailable for new assignments"}
            </p>
          </div>
          <Switch
            checked={user.is_available}
            onCheckedChange={toggleAvailability}
            disabled={busy}
            aria-label="Set my availability"
          />
        </div>
      )}

      {canManageTeam && (
        <form onSubmit={saveDivision} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div className="space-y-1.5">
            <Label htmlFor="division-name">New division</Label>
            <Input id="division-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={80} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="division-description">Description (optional)</Label>
            <Input id="division-description" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={500} />
          </div>
          <Button type="submit" disabled={busy || !name.trim()}>
            <Plus className="mr-1.5 h-4 w-4" /> Add division
          </Button>
        </form>
      )}

      {loading ? (
        <Skeleton className="h-20 rounded-lg" />
      ) : divisions.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          No divisions yet. An admin can create divisions for this workspace.
        </p>
      ) : canAssignWork ? (
        <div className="space-y-3">
          {divisions.map((division) => {
            const eligibleUsers = users.filter((member) =>
              canManageTeam ? member.role !== "admin" : member.role === "member",
            );
            return (
              <div key={division.id} className="rounded-lg border border-border p-3">
                <h3 className="text-sm font-semibold">{division.name}</h3>
                {division.description && (
                  <p className="mt-0.5 text-xs text-muted-foreground">{division.description}</p>
                )}
                {eligibleUsers.length > 0 && (
                  <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {eligibleUsers.map((member) => {
                      const assigned = (member.division_ids || []).includes(division.id);
                      const active = member.account_status === "approved" && member.team_status === "active";
                      return (
                        <label key={member.id} className="flex items-center gap-2 rounded-md bg-muted/40 px-2.5 py-2 text-xs">
                          <input
                            type="checkbox"
                            checked={assigned}
                            disabled={!active && (!canManageTeam || !assigned)}
                            onChange={(event) => toggleMembership(division.id, member, event.target.checked)}
                          />
                          <span className="min-w-0 flex-1 truncate">{member.full_name || member.email}</span>
                          {assigned && <Check className="h-3.5 w-3.5 text-emerald-600" aria-label="Assigned" />}
                          <span className={member.is_available ? "text-emerald-700" : "text-muted-foreground"}>
                            {member.is_available ? "Available" : "Away"}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {divisions.filter((division) => (user?.division_ids || []).includes(division.id)).map((division) => (
            <span key={division.id} className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
              {division.name}
            </span>
          ))}
          {divisions.every((division) => !(user?.division_ids || []).includes(division.id)) && (
            <span className="text-xs text-muted-foreground">You have not been assigned to a division yet.</span>
          )}
        </div>
      )}
    </section>
  );
}
