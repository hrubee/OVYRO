/**
 * Temporary scaffold surface. Each phase replaces these with the real view —
 * see spec §13. Kept in one place so the swap is obvious and mechanical.
 */
export function PlaceholderPage({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 p-8 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
      <p className="max-w-prose text-muted-foreground">{description}</p>
    </main>
  );
}
