'use client'

import { Sidebar } from '@/components/layout/Sidebar'
import { Header } from '@/components/layout/Header'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      <Sidebar />
      <main
        className="min-h-screen transition-all duration-300"
        style={{ marginLeft: 'var(--sidebar-width)' }}
      >
        <Header />
        <div className="p-4 md:p-6 lg:p-8 ambient-grid min-h-[calc(100vh-73px)]">
          {children}
        </div>
      </main>
    </>
  )
}
