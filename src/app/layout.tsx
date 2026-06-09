import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

export const metadata: Metadata = {
  title: "SinCraft — Voxel Engine",
  description: "SinCraft — voxel sandbox game built with custom WebGL 2 renderer.",
  icons: {
    icon: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
        <style dangerouslySetInnerHTML={{ __html: `
          :root { --font-geist-sans: 'Inter', system-ui, sans-serif; --font-geist-mono: 'JetBrains Mono', monospace; }
          body { font-family: var(--font-geist-sans); }
          code, pre, .font-mono { font-family: var(--font-geist-mono); }
        `}} />
      </head>
      <body className="antialiased bg-gray-950 text-gray-100">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
