import type { NextApiRequest, NextApiResponse } from 'next'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { generateActivitySummary } from '@/services/activity.service'
import { generateAllDrafts } from '@/services/content.service'
import type { GenerationResult } from '@/types/generation'

type ErrorResponse = { error: string }
type NoActivityResponse = { drafts: []; errors: []; noActivity: true }

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GenerationResult | ErrorResponse | NoActivityResponse>,
) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const session = await getServerSession(req, res, authOptions)
  if (!session?.user) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const { id, email } = session.user as { id?: string; email?: string | null }

  const user = id
    ? await prisma.user.findUnique({ where: { id } })
    : email
    ? await prisma.user.findUnique({ where: { email } })
    : null

  if (!user || !user.accessToken) {
    return res.status(403).json({ error: 'Missing access token — please sign out and sign in again' })
  }

  const bodyRepo: unknown = req.body?.repoFullName
  let repoFullName: string

  if (typeof bodyRepo === 'string' && bodyRepo.trim().length > 0) {
    repoFullName = bodyRepo.trim()
  } else {
    const repo = await prisma.repo.findFirst({ where: { userId: user.id } })
    if (!repo) {
      return res.status(400).json({ error: 'repoFullName required — pass it in the request body or select a repo first' })
    }
    repoFullName = repo.repoFullName
  }

  try {
    const activity = await generateActivitySummary(repoFullName, user.accessToken)

    if (!activity) {
      return res.status(200).json({ drafts: [], errors: [], noActivity: true })
    }

    const result: GenerationResult = await generateAllDrafts(activity)

    return res.status(200).json(result)
  } catch (err: unknown) {
    const isGitHub404 =
      err instanceof Error && err.message.toLowerCase().includes('404')

    if (isGitHub404) {
      return res.status(404).json({
        error: `Repository "${repoFullName}" was not found or you don't have access. Check that it's a public repo or that your GitHub token has the right scope.`,
      })
    }

    const message = err instanceof Error ? err.message : 'Failed to generate drafts'
    return res.status(502).json({ error: message })
  }
}