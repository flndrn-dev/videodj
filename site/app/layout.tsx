import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'videoDJ.Studio — AI-Powered Video DJ & Auto-Mixing',
  description: 'The intelligent Video DJ application. AI-powered beatmatching, smart playlists, live streaming to Twitch & YouTube. Built for DJs who play music videos.',
  icons: {
    icon: '/favicon.svg',
  },
  openGraph: {
    title: 'videoDJ.Studio',
    description: 'AI-Powered Video DJ & Auto-Mixing Application',
    url: 'https://videodj.studio',
    siteName: 'videoDJ.Studio',
    type: 'website',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  )
}
