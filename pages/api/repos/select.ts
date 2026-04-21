import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { NextApiRequest, NextApiResponse } from 'next'
import prisma from '@/lib/prisma'
import { saveSelectedRepo } from '@/services/github.service'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const session = await getServerSession(req, res, authOptions as any)
  if (!session || !session.user) return res.status(401).json({ error: 'Unauthorized' })

  const { repoName, repoFullName } = req.body
  if (!repoName || !repoFullName) return res.status(400).json({ error: 'Missing payload' })

  try {
    // resolve user id similar to GET handler
    let userId = session.user.id
    if (!userId && session.user.email) {
      const u = await prisma.user.findUnique({ where: { email: session.user.email } })
      userId = u?.id
    }
    if (!userId) return res.status(403).json({ error: 'Unable to resolve user' })

    const record = await saveSelectedRepo(userId, repoName, repoFullName)
    return res.status(201).json({ repo: record })
  } catch (e: any) {
    return res.status(500).json({ error: e.message || 'DB error' })
  }
}
