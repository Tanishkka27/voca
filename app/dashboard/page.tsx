import React from 'react'
import { redirect } from 'next/navigation'
import { getServerAuthSession } from '@/lib/auth'
import RepoSelector from '@/components/RepoSelector'

export default async function DashboardPage() {
  const session = await getServerAuthSession()
  if (!session) return redirect('/')

  return (
    <div className="py-16">
      <h2 className="text-2xl font-semibold">Dashboard</h2>
      <p className="mt-4 text-sm text-gray-600">This is a protected dashboard page.</p>
      <div className="mt-8">
        <h3 className="text-lg font-medium">Select a repository</h3>
        <RepoSelector />
      </div>
    </div>
  )
}
