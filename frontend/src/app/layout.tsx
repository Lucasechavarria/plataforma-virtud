import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import ClientProviders from "@/components/ClientProviders";
import { Viewport } from 'next'

export const viewport: Viewport = {
  themeColor: '#ffffff',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false
}

const inter = Inter({ 
  subsets: ["latin"],
  variable: '--font-inter',
  display: 'swap'
});

// ▼ Mantén solo ESTA declaración de metadata ▼
export const metadata: Metadata = {
  title: {
    default: "Plataforma VIRTUD",
    template: "%s | VIRTUD"
  },
  description: "Sistema de gestión integral para profesionales de la salud mental",
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'),
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es" className={`${inter.variable}`} suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="preload" href="/logo.webp" as="image" />
      </head>
      
      <body className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-300">
        <ClientProviders />
                {children}
      </body>
    </html>
  );
}