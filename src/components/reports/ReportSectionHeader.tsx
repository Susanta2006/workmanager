export default function ReportSectionHeader({ title, description, children }: any) {
  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h2 className="font-heading text-[17px] font-semibold leading-tight">
          {title}
        </h2>
        {description && (
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {children && (
        <div
          className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end"
          data-no-print
        >
          {children}
        </div>
      )}
    </div>
  );
}
