import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/** Shared frame for the login and register cards. */
export function AuthShell({
  title,
  description,
  footer,
  children,
}: {
  title: string;
  description: string;
  footer: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <Link
          href="/"
          className="mb-6 block text-center text-lg font-semibold tracking-tight"
        >
          Ovyro
        </Link>
        <Card>
          <CardHeader>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </CardHeader>
          <CardContent>{children}</CardContent>
        </Card>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          {footer}
        </p>
      </div>
    </main>
  );
}

/** Consistent inline error rendering for both forms. */
export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-sm text-destructive">
      {message}
    </p>
  );
}
