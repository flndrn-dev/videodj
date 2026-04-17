import type { Metadata } from 'next'
import './globals.css'
import { Toaster } from 'sonner'
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3030'),
  title: 'videoDJ.Studio — v1.0',
  description: 'AI-powered video DJ studio. Auto-mix, Dutch music filter, agent command bar.',
  // Installing as a PWA is what lets Chrome grant persistent File System
  // Access permissions — after install, queryPermission() returns 'granted'
  // across page reloads, so the music folder stays connected without a
  // re-pick. This ships the minimal manifest required for the install
  // prompt to appear.
  manifest: '/manifest.webmanifest',
  themeColor: '#ffff00',
  icons: {
    icon: '/favicon.svg',
  },
  openGraph: {
    title: 'videoDJ.Studio',
    description: 'AI-powered video DJ & auto-mixing studio',
    images: ['/og-image.svg'],
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={cn("font-sans", geist.variable)}>
      <body>
        {children}
        <Toaster
          position="top-center"
          richColors
          closeButton
          toastOptions={{
            duration: 3500,
            style: {
              background: '#14141f',
              border: '1px solid #2a2a3e',
              color: '#e8e8f2',
              fontFamily: 'inherit',
            },
          }}
        />
      </body>
    </html>
  )
}
