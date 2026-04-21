import './globals.css'
import React from 'react'
import SiteHeader from '@/components/site-header'

export const metadata = {
  title: 'Voca',
  description: 'Turn your product work into authentic content'
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background text-foreground">
        <SiteHeader />
        <main className="container mx-auto px-4">{children}</main>
      </body>
    </html>
  )
}
