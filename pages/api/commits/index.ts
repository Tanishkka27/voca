import { NextApiRequest, NextApiResponse } from 'next'

import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { fetchCommits } from '@/services/github.service'
import { classifyGitHubError, classifyPrismaError, sendError } from '@/lib/errors'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions)
  if (!session?.user) {
    return sendError(res, 'commits', 401, 'UNAUTHORIZED', 'Unauthorized')
  }

  const sessionUser = session.user as { id?: string; email?: string | null; githubId?: string }

  // Resolve user lookup robustly: prefer id, fall back to email or githubId
  let currentUser
  try {
    if (sessionUser.id) {
      currentUser = await prisma.user.findUnique({ where: { id: sessionUser.id } })
    } else if (sessionUser.email) {
      currentUser = await prisma.user.findUnique({ where: { email: sessionUser.email } })
    } else if (sessionUser.githubId) {
      currentUser = await prisma.user.findUnique({ where: { githubId: sessionUser.githubId } })
    }
  } catch (err) {
    const classified = classifyPrismaError(err)
    return sendError(
      res,
      'commits',
      classified?.status ?? 500,
      classified?.code ?? 'INTERNAL_ERROR',
      classified?.message ?? 'Failed to look up user',
      { message: err instanceof Error ? err.message : String(err) },
    )
  }

  if (!currentUser) {
    return sendError(res, 'commits', 403, 'PRISMA_NOT_FOUND', 'Unable to resolve user')
  }

  // If owner/repo provided as query parameters, use them; otherwise fall back to user's selected repo in DB
  const { owner, repo: repoParam } = req.query as { owner?: string; repo?: string }

  let repoFullName: string
  if (owner && repoParam) {
    repoFullName = `${owner}/${repoParam}`
  } else {
    let repo
    try {
      repo = await prisma.repo.findFirst({ where: { userId: currentUser.id } })
    } catch (err) {
      const classified = classifyPrismaError(err)
      return sendError(
        res,
        'commits',
        classified?.status ?? 500,
        classified?.code ?? 'INTERNAL_ERROR',
        classified?.message ?? 'Failed to look up selected repo',
        { userId: currentUser.id, message: err instanceof Error ? err.message : String(err) },
      )
    }
    if (!repo) {
      return sendError(res, 'commits', 404, 'REPO_NOT_SELECTED', 'No repository selected')
    }
    repoFullName = repo.repoFullName
  }

  if (!currentUser.accessToken) {
    return sendError(res, 'commits', 403, 'GITHUB_TOKEN_MISSING', 'Missing access token')
  }

  try {
    const commits = await fetchCommits(repoFullName, currentUser.accessToken)
    const out = commits.map((c) => ({ message: c.message, date: c.date, author: c.author_login }))
    return res.status(200).json({ commits: out, repoFullName })
  } catch (err) {
    const githubError = classifyGitHubError(err)
    if (githubError) {
      return sendError(res, 'commits', githubError.status, githubError.code, githubError.message, { repoFullName })
    }
    const message = err instanceof Error ? err.message : 'Failed to fetch commits'
    return sendError(res, 'commits', 502, 'GITHUB_ERROR', message, { repoFullName })
  }
}
