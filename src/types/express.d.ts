import type { Network } from '@prisma/client'

declare global {
  namespace Express {
    interface Request {
      userId?: string
      stellarPubKey?: string
      auth?: {
        userId: string
        sessionId: string
        walletAddress: string
        network: Network
      }
    }
  }
}

export {}
