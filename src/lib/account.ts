/**
 * MOCK endpoint for account deletion. It does not delete anything yet.
 * Replace the body with a real server call (for example a server function that removes
 * the user's data and auth record) before going live.
 */
export async function requestAccountDeletion() {
  await new Promise((resolve) => setTimeout(resolve, 800));
  console.info("[mock] Account deletion requested. No data was removed.");
  return { ok: true, deleted: false, mock: true };
}
