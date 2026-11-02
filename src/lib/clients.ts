import { fetchAll } from "@/lib/db";

export type ClientRow = { id: string; name: string; client_code?: string; [key: string]: any };

/** Every client in the workspace, sorted by name. Used by every page that picks a client. */
export async function fetchClients(): Promise<ClientRow[]> {
  const rows = (await fetchAll("Client")) as ClientRow[];
  return rows.sort((a, b) => String(a.name ?? "").localeCompare(String(b.name ?? ""), undefined, { sensitivity: "base" }));
}

/** Dropdown options that show the client name with its code, so the same client is easy to find. */
export function clientOptions(clients: ClientRow[] = []) {
  return clients.map((client) => ({
    value: client.id,
    label: client.client_code ? `${client.name} · ${client.client_code}` : client.name,
  }));
}
