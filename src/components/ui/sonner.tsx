import { Toaster as Sonner, type ToasterProps } from "sonner";

// Toast container. Light/dark follows the app's theme class on <html>.
const Toaster = (props: ToasterProps) => {
  const theme = typeof document !== "undefined" && document.documentElement.classList.contains("dark") ? "dark" : "light";
  return (
    <Sonner
      theme={theme}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast: "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
