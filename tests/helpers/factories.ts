/**
 * factories.ts — builder helpers that create plain objects representing
 * database records.  Useful for seeding mocks in unit and integration tests.
 */

import crypto from 'crypto';

// ─── User ────────────────────────────────────────────────────────────────────

export function createTestUser(overrides: Record<string, unknown> = {}) {
  return {
    id: crypto.randomUUID(),
    walletAddress: `G${crypto.randomBytes(4).toString('hex').toUpperCase()}TESTPUBKEY`,
    network: 'TESTNET',
    displayName: 'Test User',
    email: null,
    riskTolerance: 5,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ─── Session ─────────────────────────────────────────────────────────────────

export function createTestSession(
  userId: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    id: crypto.randomUUID(),
    userId,
    token: `token-${crypto.randomBytes(8).toString('hex')}`,
    walletAddress: 'GABC123456TESTPUBLICKEY',
    network: 'TESTNET',
    expiresAt: new Date(Date.now() + 3_600_000),
    createdAt: new Date(),
    user: { id: userId, isActive: true },
    ...overrides,
  };
}

// ─── Position ────────────────────────────────────────────────────────────────

export function createTestPosition(
  userId: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    id: crypto.randomUUID(),
    userId,
    protocolName: 'Blend',
    assetSymbol: 'USDC',
    depositedAmount: 1000,
    currentValue: 1050,
    yieldEarned: 50,
    status: 'ACTIVE',
    openedAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ─── Transaction ─────────────────────────────────────────────────────────────

export function createTestTransaction(
  userId: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    id: crypto.randomUUID(),
    userId,
    txHash: `txhash-${crypto.randomBytes(8).toString('hex')}`,
    type: 'DEPOSIT',
    status: 'CONFIRMED',
    amount: 100,
    assetSymbol: 'USDC',
    protocolName: 'Blend',
    network: 'TESTNET',
    memo: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ─── YieldSnapshot ───────────────────────────────────────────────────────────

export function createTestYieldSnapshot(
  positionId: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    id: crypto.randomUUID(),
    positionId,
    apy: 4.25,
    yieldAmount: 10,
    principalAmount: 1000,
    snapshotAt: new Date(),
    ...overrides,
  };
}
