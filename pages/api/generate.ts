import type { NextApiRequest, NextApiResponse } from 'next'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { generateActivitySummary } from '@/services/activity.service'
import { generateAllDrafts } from '@/services/content.service'
import type { GenerationResult } from '@/types/generation'
import { classifyGitHubError, classifyPrismaError, sendError } from '@/lib/errors'

type ErrorResponse = { error: string; code: string }
type NoActivityResponse = { drafts: []; errors: []; noActivity: true }

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GenerationResult | ErrorResponse | NoActivityResponse>,
) {
  // Only allow POST
  if (req.method !== 'POST') {
    return sendError(res, 'generate', 405, 'METHOD_NOT_ALLOWED', 'Method not allowed')
  }

  const session = await getServerSession(req, res, authOptions)
  if (!session?.user) {
    return sendError(res, 'generate', 401, 'UNAUTHORIZED', 'Unauthorized')
  }

  const { id, email } = session.user as { id?: string; email?: string | null }

  let user
  try {
    user = id
      ? await prisma.user.findUnique({ where: { id } })
      : email
      ? await prisma.user.findUnique({ where: { email } })
      : null
  } catch (err) {
    const classified = classifyPrismaError(err)
    return sendError(
      res,
      'generate',
      classified?.status ?? 500,
      classified?.code ?? 'INTERNAL_ERROR',
      classified?.message ?? 'Failed to look up user',
      { message: err instanceof Error ? err.message : String(err) },
    )
  }

  if (!user || !user.accessToken) {
    return sendError(res, 'generate', 403, 'GITHUB_TOKEN_MISSING', 'Missing access token — please sign out and sign in again')
  }

  const bodyRepo: unknown = req.body?.repoFullName
  let repoFullName: string

  if (typeof bodyRepo === 'string' && bodyRepo.trim().length > 0) {
    repoFullName = bodyRepo.trim()
  } else {
    let repo
    try {
      repo = await prisma.repo.findFirst({ where: { userId: user.id } })
    } catch (err) {
      const classified = classifyPrismaError(err)
      return sendError(
        res,
        'generate',
        classified?.status ?? 500,
        classified?.code ?? 'INTERNAL_ERROR',
        classified?.message ?? 'Failed to look up selected repo',
        { userId: user.id, message: err instanceof Error ? err.message : String(err) },
      )
    }
    if (!repo) {
      return sendError(res, 'generate', 400, 'VALIDATION_ERROR', 'repoFullName required — pass it in the request body or select a repo first')
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
    const githubError = classifyGitHubError(err)
    if (githubError) {
      return sendError(res, 'generate', githubError.status, githubError.code, githubError.message, { repoFullName })
    }

    const message = err instanceof Error ? err.message : 'Failed to generate drafts'
    return sendError(res, 'generate', 502, 'GENERATION_FAILED', message, { repoFullName })
  }
}
