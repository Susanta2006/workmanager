import { createStart, createCsrfMiddleware, createMiddleware } from "@tanstack/react-start";

// Server functions are same-origin RPC endpoints, so cross-site requests to them are rejected.
// Auth is still applied per server function with requireUser (src/lib/auth-middleware.ts).
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

const securityHeaders = createMiddleware({ type: "request" }).server(
  async ({ next }) => {
    const result = await next();
    const response = result.response;
    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("X-Frame-Options", "DENY");
    response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    return result;
  },
);

export const startInstance = createStart(() => ({
  requestMiddleware: [csrfMiddleware, securityHeaders],
}));
