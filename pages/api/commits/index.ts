import { NextApiRequest, NextApiResponse } from 'next'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { fetchCommits } from '@/services/github.service'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions as any)
  if (!session || !session.user) return res.status(401).json({ error: 'Unauthorized' })

  const repo = await prisma.repo.findFirst({ where: { userId: session.user.id } })
  if (!repo) return res.status(404).json({ error: 'No repository selected' })

  const user = await prisma.user.findUnique({ where: { id: session.user.id } })
  if (!user || !user.accessToken) return res.status(403).json({ error: 'Missing token' })

  try {
    const commits = await fetchCommits(repo.repoFullName, user.accessToken)
    const out = commits.map((c) => ({ message: c.message, date: c.date, author: c.author_login }))
    return res.status(200).json({ commits: out })
  } catch (e: any) {
    return res.status(502).json({ error: e.message || 'Failed to fetch commits' })
  }
}
