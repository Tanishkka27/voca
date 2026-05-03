"use client"

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

type Repo = { name: string; full_name: string; private: boolean; updated_at: string }

export default function RepoSelector() {
  const [repos, setRepos] = useState<Repo[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const router = useRouter()

  useEffect(() => {
    setLoading(true)
    fetch('/api/repos', { credentials: 'same-origin' })
      .then(async (r) => {
        const contentType = r.headers.get('content-type') || ''
        if (!r.ok) {
          // Try to read JSON error, else fallback to text
          if (contentType.includes('application/json')) {
            const err = await r.json()
            throw new Error(err.error || 'Request failed')
          } else {
            const txt = await r.text()
            throw new Error(`Unexpected response: ${txt.slice(0, 200)}`)
          }
        }
        if (!contentType.includes('application/json')) {
          const txt = await r.text()
          throw new Error(`Expected JSON but got: ${txt.slice(0,200)}`)
        }
        return r.json()
      })
      .then((d) => {
        if (d.error) throw new Error(d.error)
        setRepos(d.repos)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  async function confirm() {
    if (!selected) return
    setSaving(true)
    const [name, full] = selected.split('|')
    try {
      const res = await fetch('/api/repos/select', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoName: name, repoFullName: full }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Save failed')
      // navigate to commits page (server returns redirect hint)
      const target = data.redirect || '/commits'
      router.push(target)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div>Loading repositories…</div>
  if (error) return <div className="text-red-600">{error}</div>
  if (!repos || repos.length === 0) return <div>No repositories found.</div>

  return (
    <div className="space-y-4">
      <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {repos.map((r) => {
          const key = `${r.name}|${r.full_name}`
          const isSelected = selected === key
          return (
            <li
              key={key}
              onClick={() => setSelected(key)}
              className={`p-4 border rounded-md cursor-pointer ${isSelected ? 'border-blue-500 bg-blue-50' : 'hover:shadow'}`}
            >
              <div className="flex items-center justify-between">
                <div className="font-medium">{r.name}</div>
                <div className="text-sm text-gray-500">{r.private ? 'Private' : 'Public'}</div>
              </div>
              <div className="text-xs text-gray-400 mt-2">Updated: {new Date(r.updated_at).toLocaleString()}</div>
            </li>
          )
        })}
      </ul>
      <div className="pt-2">
        <button className="px-4 py-2 bg-green-600 text-white rounded-md" onClick={confirm} disabled={!selected || saving}>
          {saving ? 'Saving…' : 'Confirm Selection'}
        </button>
      </div>
    </div>
  )
}
