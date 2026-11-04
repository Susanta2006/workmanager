import type { QueryClient } from "@tanstack/react-query";

// Every screen that shows client, document, payment, project or report data.
const WORKSPACE_KEYS = [
  ["payments-page"],
  ["documents-page"],
  ["document-detail"],
  ["document-editor-data"],
  ["clients-page"],
  ["client-detail"],
  ["projects-page"],
  ["project-detail"],
  ["expenses-page"],
  ["tasks-page"],
  ["team"],
  ["reports"],
  ["activity-page"],
  ["global-search-index"],
  ["form-clients"],
  ["form-projects"],
];

/** Marks every workspace screen stale so it refetches and shows the latest payments and client details. */
export function refreshWorkspaceData(queryClient: QueryClient) {
  return Promise.all(WORKSPACE_KEYS.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
}
