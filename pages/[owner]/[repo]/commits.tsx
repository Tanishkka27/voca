import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/router'

type Commit = { message: string; date: string; author: string }

export default function RepoCommitsPage() {
  const router = useRouter()
  const { owner, repo } = router.query as { owner?: string; repo?: string }

  const [commits, setCommits] = useState<Commit[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    async function load() {
      if (!owner || !repo) return
      try {
        const res = await fetch(`/api/commits?owner=${encodeURIComponent(String(owner))}&repo=${encodeURIComponent(String(repo))}`, { credentials: 'same-origin' })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          if (mounted) {
            setError(data.error || `Error ${res.status}`)
            setCommits(null)
          }
        } else {
          const data = await res.json()
          if (mounted) setCommits(data.commits || [])
        }
      } catch (e: any) {
        if (mounted) setError(e.message)
      } finally {
        if (mounted) setLoading(false)
      }
    }
    load()
    return () => {
      mounted = false
    }
  }, [owner, repo])

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">{owner}/{repo} — Commits</h1>
      {loading && <p>Loading commits…</p>}
      {error && <p className="text-red-600">{error}</p>}
      {!loading && !error && commits && commits.length === 0 && <p>No commits found for this repo.</p>}
      {!loading && !error && commits && commits.length > 0 && (
        <ul className="space-y-4">
          {commits.map((c, i) => (
            <li key={i} className="border rounded p-3">
              <div className="font-medium">{c.message}</div>
              <div className="text-sm text-gray-600">{c.author} • {new Date(c.date).toLocaleString()}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
