import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { DemoBanner } from "@/components/demo-banner";
import { SiteHeader } from "@/components/site-header";
import { Providers } from "./providers";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Lance · Freelas digitais", template: "%s · Lance" },
  description: "Publique um projeto, receba propostas de freelancers e pague com segurança, por etapas.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={inter.variable}>
      <body className="min-h-screen">
        <Providers>
          <SiteHeader />
          <DemoBanner />
          {children}
        </Providers>
      </body>
    </html>
  );
}
