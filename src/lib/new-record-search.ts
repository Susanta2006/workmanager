// URL parameters that open a create dialog with its client already chosen.
//   /tasks?new=1&client=<client id>    opens "New task" for that client
// Used by the client page's quick actions, so the client never has to be picked again.

export type NewRecordSearch = { client?: string; new?: true };

export function validateNewRecordSearch(search: Record<string, unknown>): NewRecordSearch {
  const client =
    typeof search.client === "string" && search.client.length > 0 && search.client.length <= 64
      ? search.client
      : undefined;
  const isNew = search.new === true || search.new === "1" || search.new === "true";
  return { ...(client ? { client } : {}), ...(isNew ? { new: true as const } : {}) };
}
