import { createMiddleware } from "@tanstack/react-start";
import { getRequest, setResponseStatus } from "@tanstack/react-start/server";
import { getSupabase } from "@/lib/supabase";

// Applied to a server function that needs a signed-in, approved caller:
//   createServerFn({ method: "POST" }).middleware([requireUser]).handler(({ context }) => context.user.id)
// The browser attaches the Supabase access token; the server verifies it.
export const requireUser = createMiddleware({ type: "function" })
  .client(async ({ next }) => {
    const { data } = await getSupabase().auth.getSession();
    const token = data.session?.access_token;
    return next({ headers: token ? { Authorization: `Bearer ${token}` } : {} });
  })
  .server(async ({ next }) => {
    // Dynamic import keeps the service-role code out of the browser bundle.
    const { verifyRequestUser } = await import("@/lib/auth.server");
    const user = await verifyRequestUser(getRequest());
    if (!user) {
      setResponseStatus(401);
      throw Object.assign(new Error("Unauthorized"), { status: 401 });
    }
    return next({ context: { user } });
  });

// Used only for OAuth onboarding and passcode endpoints, which must work before
// workspace approval and before the current session has passed its passcode gate.
export const requireIdentity = createMiddleware({ type: "function" })
  .client(async ({ next }) => {
    const { data } = await getSupabase().auth.getSession();
    const token = data.session?.access_token;
    return next({ headers: token ? { Authorization: `Bearer ${token}` } : {} });
  })
  .server(async ({ next }) => {
    const { verifyRequestIdentity } = await import("@/lib/auth.server");
    const identity = await verifyRequestIdentity(getRequest());
    if (!identity || !identity.isGoogleUser) {
      setResponseStatus(401);
      throw Object.assign(new Error("Sign in with Google to continue."), { status: 401 });
    }
    return next({ context: { identity } });
  });
