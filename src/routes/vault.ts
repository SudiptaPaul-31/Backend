import { Router, Request, Response } from 'express'
import db from '../db'
import { requireAuth } from '../middleware/auth'
import {
  getActiveProtocol,
  getOnChainAPY,
  getOnChainBalance,
} from '../stellar/contract'

const router = Router()

function toNumber(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

router.get('/state', async (req: Request, res: Response) => {
  const [apy, activeProtocol] = await Promise.all([
    getOnChainAPY(),
    getActiveProtocol(),
  ])

  return res.status(200).json({
    apy,
    activeProtocol,
  })
})

router.get('/balance', requireAuth, async (req: Request, res: Response) => {
  const userId = req.auth?.userId
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { walletAddress: true },
  })

  if (!user) {
    return res.status(404).json({ error: 'User not found' })
  }

  const onChain = await getOnChainBalance(user.walletAddress)

  return res.status(200).json({
    balance: toNumber(onChain.balance),
    shares: toNumber(onChain.shares),
  })
})

export default router
