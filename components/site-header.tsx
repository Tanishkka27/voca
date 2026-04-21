import Link from 'next/link'
import React from 'react'

export default function SiteHeader() {
  return (
    <header className="w-full border-b py-4 bg-white">
      <div className="container mx-auto flex items-center justify-between px-4">
        <Link href="/" className="text-lg font-bold">
          Voca
        </Link>
        <nav>
          <Link href="/dashboard" className="text-sm text-gray-700">
            Dashboard
          </Link>
        </nav>
      </div>
    </header>
  )
}
