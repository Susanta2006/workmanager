import { useAuth } from "@/lib/AuthContext";

// Three roles. Admin runs the workspace. Leader runs day-to-day work. Member works on assigned items.
export const ROLE_LABELS = { admin: "Admin", leader: "Leader", member: "Member" };

export const ROLE_HINTS = {
  admin: "Full workspace access. Up to three approved admins; the founding admin controls other admin roles.",
  leader: "Runs assigned day-to-day work. An admin grants or revokes the Leader role.",
  member: "Works on clients, projects, tasks and documents. Cannot see payments, expenses or team settings.",
};

const ALL_MODULES = [
  "dashboard", "clients", "projects", "tasks", "documents", "payments",
  "expenses", "reports", "team", "salary", "notifications", "activity", "settings",
];

const ACCESS = {
  admin: ALL_MODULES,
  leader: ["dashboard", "clients", "projects", "tasks", "documents", "payments", "expenses", "reports", "team", "notifications"],
  member: ["dashboard", "clients", "projects", "tasks", "documents", "team", "notifications"],
};

export const roleOf = (user: any) => (user && (ACCESS as Record<string, any>)[user.role] ? user.role : "member");

export function usePermissions() {
  const { user } = useAuth();
  const role = roleOf(user);
  const allowed = (ACCESS as Record<string, any>)[role];
  const isAdmin = role === "admin";
  return {
    user,
    role,
    roleLabel: (ROLE_LABELS as Record<string, any>)[role],
    can: (key: any) => allowed.includes(key),
    // Only admins change settings, roles, approvals and members, and delete records.
    canManageSettings: isAdmin,
    canManageTeam: isAdmin,
    canAssignWork: role === "admin" || role === "leader",
    canChangeRoles: isAdmin,
    canDelete: isAdmin,
  };
}
