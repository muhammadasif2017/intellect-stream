type PagePlaceholderProps = {
  title: string;
  description: string;
  milestone: string;
};

/* Stub page — each surface replaces this in its own milestone. */
export function PagePlaceholder({
  title,
  description,
  milestone,
}: PagePlaceholderProps) {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      <div className="mt-8 rounded-lg border border-dashed border-border bg-surface p-8 text-center text-sm text-muted-foreground">
        Coming in {milestone}
      </div>
    </div>
  );
}
