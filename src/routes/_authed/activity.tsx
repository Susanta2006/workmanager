import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { History, Search } from "lucide-react";
import { fetchAll } from "@/lib/db";
import { fmtDateTime } from "@/lib/format";
import PageHeader from "@/components/common/PageHeader";
import DataToolbar from "@/components/common/DataToolbar";
import EmptyState from "@/components/common/EmptyState";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authed/activity")({
  head: () => ({ meta: [{ title: "Activity log · WorkManager" }] }),
  component: ActivityPage,
});

function ActivityPage() {
  const [search, setSearch] = useState("");
  const [entity, setEntity] = useState("all");
  const [actor, setActor] = useState("all");

  const { data, isLoading } = useQuery({
    queryKey: ["activity-page"],
    queryFn: async () => ({
      logs: await fetchAll("ActivityLog", null),
    }),
  });

  const logs: any[] = useMemo(() => data?.logs || [], [data]);

  const entityTypes = useMemo(
    () =>
      Array.from(new Set(logs.map((log) => log.entity_type).filter(Boolean))),
    [logs],
  );
  const actors = useMemo(
    () =>
      Array.from(new Set(logs.map((log) => log.actor_email).filter(Boolean))),
    [logs],
  );

  const rows = useMemo(
    () =>
      logs
        .filter((log) => {
          if (entity !== "all" && log.entity_type !== entity) return false;
          if (actor !== "all" && log.actor_email !== actor) return false;
          if (search) {
            const haystack =
              `${log.action} ${log.entity_label} ${log.details} ${log.actor_name}`.toLowerCase();
            if (!haystack.includes(search.toLowerCase())) return false;
          }
          return true;
        })
        .sort((a: any, b: any) =>
          String(b.created_date).localeCompare(String(a.created_date)),
        ),
    [logs, entity, actor, search],
  );

  if (isLoading) return <Skeleton className="h-[400px] rounded-xl" />;

  return (
    <div>
      <PageHeader
        title="Activity log"
        description="An append-only trail of the actions taken in this workspace. Logs are cleared on the 1st of each month."
      />

      <DataToolbar>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search actions, records or people"
            className="h-9 bg-white pl-9 text-[13px]"
          />
        </div>
        <Select value={entity} onValueChange={setEntity}>
          <SelectTrigger className="h-9 w-[160px] bg-white text-[12.5px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All record types</SelectItem>
            {entityTypes.map((type) => (
              <SelectItem key={type} value={type}>
                {type}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={actor} onValueChange={setActor}>
          <SelectTrigger className="h-9 w-[200px] bg-white text-[12.5px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Everyone</SelectItem>
            {actors.map((email) => (
              <SelectItem key={email} value={email}>
                {email}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </DataToolbar>

      {rows.length === 0 ? (
        <EmptyState
          icon={History}
          title="No activity recorded"
          description="Actions such as creating clients, issuing documents and recording payments are logged here."
        />
      ) : (
        <div className="surface overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/70">
                  <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    When
                  </TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Who
                  </TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Action
                  </TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Record
                  </TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Details
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="whitespace-nowrap text-[11.5px] text-muted-foreground">
                      {fmtDateTime(log.created_date)}
                    </TableCell>
                    <TableCell className="text-[12px]">
                      {log.actor_name || log.actor_email || "—"}
                    </TableCell>
                    <TableCell className="text-[12.5px] font-medium">
                      {log.action}
                    </TableCell>
                    <TableCell className="text-[12px] text-slate-600">
                      {log.entity_type || "—"}
                      {log.entity_label ? (
                        <span className="block text-[11px] text-muted-foreground">
                          {log.entity_label}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="max-w-[280px] text-[11.5px] text-muted-foreground">
                      {log.details || "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
      <p className="mt-3 text-[11px] text-muted-foreground">
        {rows.length} of {logs.length} entries shown. Log entries can only be
        edited or removed by an admin.
      </p>
    </div>
  );
}
