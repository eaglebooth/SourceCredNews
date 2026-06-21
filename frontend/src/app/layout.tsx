import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SourceCred News - On-chain source verification",
  description: "GenLayer-native rewards for high-quality news verification sources.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
