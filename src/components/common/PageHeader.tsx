export default function PageHeader({ title, description, children }: any) {
  return (
    <div className="mb-4 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
      <div className="min-w-0">
        <h1 className="font-heading text-[19px] font-bold leading-tight text-foreground sm:text-[26px]">
          {title}
        </h1>
        {description && (
          <p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-muted-foreground sm:text-[13px]">
            {description}
          </p>
        )}
      </div>
      {children && (
        <div className="flex flex-wrap items-center gap-2" data-no-print>
          {children}
        </div>
      )}
    </div>
  );
}
