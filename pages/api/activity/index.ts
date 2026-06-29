import { NextApiRequest, NextApiResponse } from 'next'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { generateActivitySummary } from '@/services/activity.service'
import type { Session } from 'next-auth'

type ActivitySession = Session & {
  user?: Session['user'] & {
    id?: string
    githubId?: string
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = (await getServerSession(req, res, authOptions)) as ActivitySession | null
  if (!session || !session.user) return res.status(401).json({ error: 'Unauthorized' })

  // resolve current user similar to other routes
  let user = null
  if (session.user.id) user = await prisma.user.findUnique({ where: { id: session.user.id } })
  else if (session.user.email) user = await prisma.user.findUnique({ where: { email: session.user.email } })
  else if (session.user.githubId) user = await prisma.user.findUnique({ where: { githubId: session.user.githubId } })

  if (!user || !user.accessToken) return res.status(403).json({ error: 'Missing token' })

  const repo = await prisma.repo.findFirst({ where: { userId: user.id } })
  if (!repo) return res.status(404).json({ error: 'No repository selected' })

  try {
    const summary = await generateActivitySummary(repo.repoFullName, user.accessToken)

    if (!summary) {
      return res.status(200).json({ summary: null })
    }

    return res.status(200).json({ summary })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Failed to generate activity summary'
    return res.status(502).json({ error: message })
  }
}
