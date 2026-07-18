import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { NextApiRequest, NextApiResponse } from 'next'
import prisma from '@/lib/prisma'
import { fetchUserRepos } from '@/services/github.service'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = (await getServerSession(req, res, authOptions as any)) as any
  if (!session || !session.user) return res.status(401).json({ error: 'Unauthorized' })

  // get access token from DB (do not rely on client session)
  let user = null
  if (session.user.id) {
    user = await prisma.user.findUnique({ where: { id: session.user.id } })
  } else if (session.user.email) {
    user = await prisma.user.findUnique({ where: { email: session.user.email } })
  } else if ((session.user as any).githubId) {
    user = await prisma.user.findUnique({ where: { githubId: (session.user as any).githubId } })
  }

  if (!user || !user.accessToken) return res.status(403).json({ error: 'Missing token' })

  try {
    const repos = await fetchUserRepos(user.accessToken)
    return res.status(200).json({ repos })
  } catch (e: any) {
    return res.status(502).json({ error: e.message || 'GitHub fetch failed' })
  }
}
