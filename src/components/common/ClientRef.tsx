// One way to show a client everywhere: the name plus its client code (for example CL-0007).
// Pass the linked client record so the name and code always match the client section.
export default function ClientRef({ client, name, className = "" }: any) {
  const label = name ?? client?.name ?? "—";
  return (
    <span className={`inline-flex flex-wrap items-center gap-1.5 ${className}`}>
      <span>{label}</span>
      {client?.client_code && (
        <span className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[10.5px] text-muted-foreground">
          {client.client_code}
        </span>
      )}
    </span>
  );
}
