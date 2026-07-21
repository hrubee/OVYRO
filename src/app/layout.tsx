import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Ovyro",
    template: "%s · Ovyro",
  },
  description:
    "A marketplace for land-only real estate. Landowners list parcels with photos, videos, and pricing; investors browse, save, and submit inquiries.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
