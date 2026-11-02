import { useServerFn } from "@tanstack/react-start";
import { deleteMemberAccount } from "@/lib/admin-fns";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import { Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  Mail,
  Pencil,
  Plus,
  ShieldCheck,
  UserRound,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { backend } from "@/api/backend";
import { fetchAll, fetchUsers, logActivity, pushNotification } from "@/lib/db";
import { useAuth } from "@/lib/AuthContext";
import { usePermissions, ROLE_LABELS } from "@/lib/permissions";
import { useOrgSettings } from "@/lib/org-settings";
import { fetchWorkDivisions } from "@/lib/workforce";
import { WorkDivisionManager } from "@/components/team/WorkDivisionManager";
import PageHeader from "@/components/common/PageHeader";
import EmptyState from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authed/team")({
  head: () => ({ meta: [{ title: "Team · WorkManager" }] }),
  component: TeamPage,
});

const ROLE_HINTS = {
  admin: "Full access. Up to three approved admins. The founding admin alone can grant or revoke other admin roles.",
  leader: "Assigned by an admin. Runs day-to-day work on clients, projects, documents, payments and expenses.",
  member: "Works on clients, projects, tasks and documents. Cannot see payments, expenses or team settings.",
};

const isApproved = (member: any) => member.account_status === "approved";

function TeamPage() {
  const { user } = useAuth();
  const { canManageTeam, canAssignWork } = usePermissions();
  const deleteMember = useServerFn(deleteMemberAccount);
  const [removing, setRemoving] = useState<any>(null);
  const [removeBusy, setRemoveBusy] = useState(false);

  const removeMember = async () => {
    if (!removing) return;
    setRemoveBusy(true);
    try {
      await deleteMember({ data: { userId: removing.id } });
      toast.success("Member deleted");
      setRemoving(null);
      refresh();
    } catch (error: any) {
      toast.error(error?.message || "Could not delete this member.");
    } finally {
      setRemoveBusy(false);
    }
  };
  const { settings } = useOrgSettings();
  const queryClient = useQueryClient();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invite, setInvite] = useState({
    email: "",
  });
  const [editing, setEditing] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["team"],
    queryFn: async () => {
      const users = await fetchUsers();
      const [projects, tasks, divisions] = await Promise.all([
        fetchAll("Project", null),
        fetchAll("Task", null),
        fetchWorkDivisions(),
      ]);
      return { users, projects, tasks, divisions };
    },
  });

  const members = useMemo(() => {
    const projects = data?.projects || [];
    const tasks = data?.tasks || [];
    return (data?.users || []).map((member: any) => ({
      member,
      projects: projects.filter((p: any) => (p.team || []).includes(member.email))
        .length,
      tasks: tasks.filter(
        (t: any) =>
          t.assigned_to === member.email &&
          !["completed", "cancelled"].includes(t.status),
      ).length,
      completed: tasks.filter(
        (task: any) => task.assigned_to === member.email && task.status === "completed",
      ).length,
      completedOnTime: tasks.filter(
        (task: any) =>
          task.assigned_to === member.email &&
          task.status === "completed" &&
          task.due_date &&
          task.completed_date &&
          String(task.completed_date).slice(0, 10) <= String(task.due_date).slice(0, 10),
      ).length,
      averageProgress: (() => {
        const assigned = tasks.filter(
          (task: any) => task.assigned_to === member.email && task.status !== "cancelled",
        );
        return assigned.length
          ? Math.round(assigned.reduce((sum: any, task: any) => sum + Number(task.progress || 0), 0) / assigned.length)
          : 0;
      })(),
    }));
  }, [data]);

  const pending = members.filter(({ member }: any) => !isApproved(member));
  const isFoundingAdmin = Boolean(
    data?.users.find((member: any) => member.id === user?.id)?.can_manage_admins,
  );

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["team"] });

  const approve = async (member: any) => {
    try {
      // Approval only admits the person as a Member. Admin is granted separately from the
      // role editor, so a requested Admin role can never be approved by accident.
      await backend.entities.User.update(member.id, {
        account_status: "approved",
        team_status: "active",
        role: "member",
      });
      await logActivity({
        user,
        action: "Member approved",
        entityType: "User",
        entityId: member.id,
        label: member.full_name || member.email,
      });
      toast.success(`${member.full_name || member.email} can now sign in`);
      refresh();
    } catch (error: any) {
      toast.error(error?.message || "Could not approve this member.");
    }
  };

  const saveMember = async () => {
    if (!editing) return;
    setBusy(true);
    try {
      await backend.entities.User.update(editing.member.id, {
        full_name: editing.full_name,
        role: editing.role,
        account_status: editing.account_status,
      });
      await logActivity({
        user,
        action: "Member details updated",
        entityType: "User",
        entityId: editing.member.id,
        label: editing.full_name || editing.member.email,
      });
      toast.success("Member updated");
      setEditing(null);
      refresh();
    } catch (error: any) {
      toast.error(error?.message || "Could not update this member.");
    } finally {
      setBusy(false);
    }
  };

  const changeRole = async (member: any, teamRole: any) => {
    if (member.is_founding_admin) {
      toast.error("The founding admin's role cannot be changed.");
      return;
    }
    try {
      await backend.entities.User.update(member.id, { role: teamRole });
      await logActivity({
        user,
        action: "Team role changed",
        entityType: "User",
        entityId: member.id,
        label: member.full_name || member.email,
        details: `→ ${(ROLE_LABELS as Record<string, any>)[teamRole]}`,
      });
      toast.success("Role updated");
      refresh();
    } catch (error: any) {
      toast.error(error?.message || "Could not update this member's role.");
    }
  };

  const toggleStatus = async (member: any) => {
    if (member.is_founding_admin) {
      toast.error("The founding admin cannot be deactivated.");
      return;
    }
    if (member.role === "admin" && !isFoundingAdmin) {
      toast.error("Only the founding admin can deactivate another admin.");
      return;
    }
    const next = member.team_status === "inactive" ? "active" : "inactive";
    try {
      await backend.entities.User.update(member.id, { team_status: next });
      await logActivity({
        user,
        action:
          next === "inactive"
            ? "Team member deactivated"
            : "Team member reactivated",
        entityType: "User",
        entityId: member.id,
        label: member.full_name || member.email,
      });
      toast.success(
        next === "inactive" ? "Member deactivated" : "Member reactivated",
      );
      refresh();
    } catch (error: any) {
      toast.error(error?.message || "Could not change this member's status.");
    }
  };

  const sendInvite = async () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(invite.email)) {
      toast.error("Enter a valid email address.");
      return;
    }
    if ((data?.users || []).some((member: any) => member.email.toLowerCase() === invite.email.trim().toLowerCase())) {
      toast.error("This email already has a workspace account.");
      return;
    }
    setBusy(true);
    try {
      // Invitations only identify an expected member email; they never assign roles or approve access.
      const invitation = await backend.entities.Invitation.create({
        email: invite.email,
        role: "member",
        invited_by: user?.id ?? "",
      });
      await logActivity({
        user,
        action: "Team invitation sent",
        entityType: "User",
        label: invite.email,
        details: "Member registration still requires admin approval",
      });
      await pushNotification({
        title: "Team invitation sent",
        message: `${invite.email} can register as a member; admin approval is still required.`,
        type: "team",
        link: "/team",
        relatedRecordId: invitation.id,
      });
      toast.success("Member invite recorded");
      setInviteOpen(false);
      setInvite({ email: "" });
      refresh();
    } catch (error: any) {
      toast.error(error?.message || "Could not send the invitation.");
    } finally {
      setBusy(false);
    }
  };

  if (isLoading) return <Skeleton className="h-[400px] rounded-xl" />;
  if (!data) {
    return (
      <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
        Could not load team and work assignment data: {error instanceof Error ? error.message : "Unknown error."}
      </p>
    );
  }

  return (
    <div>
      <PageHeader
        title="Team"
        description="Team roles, availability, assigned work, and progress."
      >
        {canManageTeam && (
          <Button size="sm" onClick={() => setInviteOpen(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Invite member
          </Button>
        )}
      </PageHeader>

      <WorkDivisionManager
        user={(data?.users || []).find((member: any) => member.id === user?.id) || null}
        users={data?.users || []}
        divisions={data?.divisions || []}
        canManageTeam={canManageTeam}
        canAssignWork={canAssignWork}
        loading={isLoading}
        onChanged={refresh}
      />

      {(settings.business_type || "solo") === "solo" && (
        <div className="mb-4 rounded-xl border border-border bg-card p-4 text-[12px] leading-relaxed text-slate-600">
          <p className="flex items-center gap-1.5 font-medium text-slate-800">
            <Users className="h-3.5 w-3.5 text-primary" /> Solo workspace
          </p>
          <p className="mt-1">
            This workspace is set to Solo, so only the admin works here. Switch
            to Team in Settings → Company profile to invite members; you stay
            the only admin and every member needs your approval before they can
            sign in.
          </p>
        </div>
      )}

      <div className="mb-4 rounded-xl border border-border bg-card p-4 text-[12px] leading-relaxed text-slate-600">
        <p className="flex items-center gap-1.5 font-medium text-slate-800">
          <ShieldCheck className="h-3.5 w-3.5 text-primary" /> How approval
          works
        </p>
        <p className="mt-1">
          Every registration, including admin requests, stays signed out until
          the founding admin approves it here. The founding admin alone can
          promote or revoke another admin; admins can assign the Leader role to
          members. Deactivation removes workspace access.
        </p>
      </div>

      {pending.length > 0 && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50/70 p-4">
          <p className="text-[12px] font-semibold text-amber-900">
            Awaiting founding admin approval ({pending.length})
          </p>
          <ul className="mt-2 divide-y divide-amber-200/70">
            {pending.map(({ member }: any) => (
              <li
                key={member.id}
                className="flex flex-wrap items-center justify-between gap-2 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-[12.5px] font-medium text-amber-900">
                    {member.full_name || member.email}
                  </p>
                  <p className="truncate text-[11px] text-amber-800/80">
                    {member.email} · requested {(ROLE_LABELS as Record<string, any>)[member.role] || "Member"} · awaiting approval
                  </p>
                </div>
                {isFoundingAdmin && (
                  <Button
                    size="sm"
                    className="h-8 text-[11.5px]"
                    onClick={() => approve(member)}
                  >
                    <Check className="mr-1 h-3.5 w-3.5" /> Approve
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {members.length === 0 ? (
        <EmptyState
          icon={UserRound}
          title="No team members found"
          description="Invite a colleague to collaborate on clients and projects."
        />
      ) : (
        <div className="surface overflow-hidden">
          <div className="divide-y divide-border/70">
            {members.map(({ member, projects, tasks, completed, completedOnTime, averageProgress }: any) => (
              <div
                key={member.id}
                className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-violet))] text-[11px] font-semibold text-white">
                    {String(member.full_name || member.email || "?")
                      .slice(0, 2)
                      .toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-1.5 truncate text-[13px] font-semibold">
                      {member.full_name || member.email}
                      {member.id === user?.id && (
                        <Badge
                          variant="secondary"
                          className="h-4 px-1.5 text-[9.5px] font-normal"
                        >
                          You
                        </Badge>
                      )}
                      {!isApproved(member) && (
                        <Badge
                          variant="outline"
                          className="h-4 border-amber-200 px-1.5 text-[9.5px] font-normal text-amber-700"
                        >
                          Awaiting approval
                        </Badge>
                      )}
                      {member.team_status === "inactive" && (
                        <Badge
                          variant="outline"
                          className="h-4 border-rose-200 px-1.5 text-[9.5px] font-normal text-rose-600"
                        >
                          Inactive
                        </Badge>
                      )}
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      <Mail className="mr-1 inline h-3 w-3" />
                      {member.email} · {projects} project(s) · {tasks} open task(s) · {completed} completed ({completedOnTime} on time) · {averageProgress}% avg progress
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    value={member.role || "member"}
                    onValueChange={(value) => changeRole(member, value)}
                    disabled={
                      !canManageTeam ||
                      member.is_founding_admin ||
                      (member.role === "admin" && !isFoundingAdmin)
                    }
                  >
                    <SelectTrigger className="h-8 w-[124px] bg-white text-[12px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(ROLE_LABELS)
                        .filter(([value]) => value !== "admin" || isFoundingAdmin)
                        .map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  {canManageTeam && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-[11.5px]"
                        onClick={() =>
                          setEditing({
                            member,
                            full_name: member.full_name || "",
                            role: member.role || "member",
                            account_status: member.account_status || "pending",
                          })
                        }
                      >
                        <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-[11.5px]"
                        onClick={() => toggleStatus(member)}
                        disabled={member.id === user?.id || member.is_founding_admin || (member.role === "admin" && !isFoundingAdmin)}
                      >
                        {member.team_status === "inactive"
                          ? "Reactivate"
                          : "Deactivate"}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-[11.5px] text-rose-600 hover:text-rose-700"
                        onClick={() => setRemoving(member)}
                        disabled={member.id === user?.id || member.is_founding_admin || (member.role === "admin" && !isFoundingAdmin)}
                      >
                        <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Object.entries(ROLE_HINTS).map(([role, hint]) => (
          <div key={role} className="surface p-3">
            <p className="text-[12px] font-semibold text-slate-800">
              {(ROLE_LABELS as Record<string, any>)[role]}
            </p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
              {hint}
            </p>
          </div>
        ))}
      </div>

      <Dialog
        open={Boolean(editing)}
        onOpenChange={(open) => !open && setEditing(null)}
      >
        <DialogContent className="max-w-[460px]">
          <DialogHeader>
            <DialogTitle className="font-heading text-lg">
              Edit member
            </DialogTitle>
            <DialogDescription className="text-[12.5px]">
              Admins manage members and Leaders. The founding admin controls other admin accounts.
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div>
                <p className="mb-1 text-[12px] font-medium text-slate-600">
                  Email
                </p>
                <Input
                  value={editing.member.email || ""}
                  disabled
                  className="h-9 text-[13px]"
                />
              </div>
              <div>
                <p className="mb-1 text-[12px] font-medium text-slate-600">
                  Full name
                </p>
                <Input
                  value={editing.full_name}
                  onChange={(e) =>
                    setEditing((prev: any) => ({
                      ...prev,
                      full_name: e.target.value,
                    }))
                  }
                  className="h-9 text-[13px]"
                />
              </div>
              <div>
                <p className="mb-1 text-[12px] font-medium text-slate-600">
                  Role
                </p>
                <Select
                  value={editing.role}
                  disabled={
                    editing.member.is_founding_admin ||
                    (editing.member.role === "admin" && !isFoundingAdmin)
                  }
                  onValueChange={(value) =>
                    setEditing((prev: any) => ({ ...prev, role: value }))
                  }
                >
                  <SelectTrigger className="h-9 text-[13px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(ROLE_LABELS)
                      .filter(([value]) => value !== "admin" || isFoundingAdmin)
                      .map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {(ROLE_HINTS as Record<string, any>)[editing.role]}
                </p>
              </div>
              <div>
                <p className="mb-1 text-[12px] font-medium text-slate-600">
                  Access
                </p>
                <Select
                  value={editing.account_status}
                  disabled={
                    editing.member.is_founding_admin ||
                    (editing.member.account_status === "pending" && !isFoundingAdmin) ||
                    (editing.member.role === "admin" &&
                      !isFoundingAdmin &&
                      editing.account_status !== "pending")
                  }
                  onValueChange={(value) =>
                    setEditing((prev: any) => ({ ...prev, account_status: value }))
                  }
                >
                  <SelectTrigger className="h-9 text-[13px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="approved">
                      Approved — can sign in
                    </SelectItem>
                    <SelectItem value="pending">
                      Pending — waiting for approval
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditing(null)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button onClick={saveMember} disabled={busy}>
              {busy ? "Saving…" : "Save member"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(value: any) => !value && setRemoving(null)}
        title="Delete this member?"
        description={`${removing?.full_name || removing?.email || "This member"} will lose access and be removed from the team. Records they created stay in the workspace.`}
        confirmLabel="Delete member"
        destructive
        busy={removeBusy}
        onConfirm={removeMember}
      />


      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="max-w-[460px]">
          <DialogHeader>
            <DialogTitle className="font-heading text-lg">
              Invite a team member
            </DialogTitle>
            <DialogDescription className="text-[12.5px]">
              Record a member invitation. No email is sent; the person must register and then wait for admin approval.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <p className="mb-1 text-[12px] font-medium text-slate-600">
                Email address
              </p>
              <Input
                value={invite.email}
                onChange={(e) =>
                  setInvite((prev) => ({ ...prev, email: e.target.value }))
                }
                placeholder="name@example.com"
                className="h-9 text-[13px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setInviteOpen(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button onClick={sendInvite} disabled={busy}>
              {busy ? "Saving…" : "Record invitation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
