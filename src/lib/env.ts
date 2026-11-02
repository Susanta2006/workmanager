// Browser code can only see VITE_-prefixed values; server code reads process.env.
export function serverEnv(name: string): string | undefined {
  const fromProcess = (globalThis as any).process?.env?.[name];
  const fromVite = (import.meta.env as Record<string, string | undefined>)[name];
  return fromProcess || fromVite || undefined;
}
