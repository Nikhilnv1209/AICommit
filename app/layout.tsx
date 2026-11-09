import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ClerkProvider } from "@clerk/nextjs";
import { Toaster } from "sonner";
import QueryProvider from "@/lib/QueryProvider";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { initServer } from "@/lib/server-init";

// Initialize server on startup
if (typeof window === 'undefined') {
  initServer().catch(console.error);
}

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AICommit",
  description: "Index GitHub repositories, summarize commits, map file and call dependencies, and turn meetings into issues.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html lang="en" suppressHydrationWarning>
        <body
          className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        >
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            storageKey="ai-commit-theme"
          >
            <Toaster position="top-right" expand theme="system" />
            <QueryProvider>
              {children}
            </QueryProvider>
          </ThemeProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
