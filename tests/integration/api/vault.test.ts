import request from 'supertest'

const mockDb = {
  session: { findUnique: jest.fn() },
  user: { findUnique: jest.fn() },
  position: { findMany: jest.fn() },
  yieldSnapshot: { findMany: jest.fn() },
  transaction: {
    count: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
  },
  protocolRate: { findMany: jest.fn() },
  agentLog: { findFirst: jest.fn() },
}

jest.mock('../../../src/db', () => ({
  __esModule: true,
  default: mockDb,
  db: mockDb,
}))

const mockGetOnChainAPY = jest.fn()
const mockGetActiveProtocol = jest.fn()
const mockGetOnChainBalance = jest.fn()

jest.mock('../../../src/stellar/contract', () => ({
  getOnChainAPY: () => mockGetOnChainAPY(),
  getActiveProtocol: () => mockGetActiveProtocol(),
  getOnChainBalance: (stellarPubKey: string) => mockGetOnChainBalance(stellarPubKey),
}))

import app from '../../../src/index'

const userId = '550e8400-e29b-41d4-a716-446655440007'
const token = 'vault-token'
const walletAddress = 'GAUTH_USER_STELLAR_PUBKEY'

describe('Vault API routes', () => {
  beforeEach(() => {
    jest.clearAllMocks()

    mockDb.session.findUnique.mockResolvedValue({
      id: 'session-vault-1',
      userId,
      walletAddress,
      network: 'TESTNET',
      expiresAt: new Date(Date.now() + 60_000),
      user: { id: userId, isActive: true },
    })

    mockDb.user.findUnique.mockResolvedValue({
      walletAddress,
    })

    mockGetOnChainAPY.mockResolvedValue(8.75)
    mockGetActiveProtocol.mockResolvedValue('Blend')
    mockGetOnChainBalance.mockResolvedValue({
      balance: '1500.25',
      shares: '1450.1',
    })
  })

  describe('GET /api/vault/state', () => {
    it('returns vault state shape', async () => {
      const res = await request(app).get('/api/vault/state')

      expect(res.status).toBe(200)
      expect(res.body).toEqual({
        apy: 8.75,
        activeProtocol: 'Blend',
      })
      expect(mockGetOnChainAPY).toHaveBeenCalledTimes(1)
      expect(mockGetActiveProtocol).toHaveBeenCalledTimes(1)
    })
  })

  describe('GET /api/vault/balance', () => {
    it('returns 401 without token', async () => {
      const res = await request(app).get('/api/vault/balance')

      expect(res.status).toBe(401)
      expect(res.body.error).toBe('Unauthorized')
    })

    it('returns 404 when authenticated user is missing', async () => {
      mockDb.user.findUnique.mockResolvedValue(null)

      const res = await request(app)
        .get('/api/vault/balance')
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(404)
      expect(res.body.error).toBe('User not found')
    })

    it('returns numeric balance and shares from on-chain reads', async () => {
      const res = await request(app)
        .get('/api/vault/balance')
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body).toEqual({
        balance: 1500.25,
        shares: 1450.1,
      })
      expect(mockDb.user.findUnique).toHaveBeenCalledWith({
        where: { id: userId },
        select: { walletAddress: true },
      })
      expect(mockGetOnChainBalance).toHaveBeenCalledWith(walletAddress)
    })
  })
})
