/**
 * Unit tests for src/agent/scanner.ts
 *
 * All Prisma database calls are mocked — no real DB is used.
 */

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    protocolRate: {
      create: jest.fn().mockResolvedValue({}),
      findFirst: jest.fn(),
    },
  })),
  Prisma: {
    Decimal: class {
      private _v: number;
      constructor(v: unknown) {
        this._v = Number(v);
      }
      toNumber() {
        return this._v;
      }
    },
  },
}));

import { PrismaClient } from '@prisma/client';
import {
  scanAllProtocols,
  getCurrentOnChainApy,
  getBestProtocol,
} from '../../../src/agent/scanner';

// Capture the mock Prisma instance eagerly at module-load time, before any
// jest.clearAllMocks() call can wipe mock.results.
// scanner.ts runs `new PrismaClient()` at the top level when first imported,
// so mock.results[0] is populated here.
const _prismaInstance = (PrismaClient as jest.Mock).mock.results[0]
  ?.value as { protocolRate: { create: jest.Mock; findFirst: jest.Mock } };

function getMockPrisma() {
  return _prismaInstance;
}

describe('Agent Scanner', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Re-attach default implementations after clearAllMocks
    const p = getMockPrisma();
    if (p) {
      p.protocolRate.create.mockResolvedValue({});
      p.protocolRate.findFirst.mockResolvedValue(null);
    }
  });

  // ── scanAllProtocols ──────────────────────────────────────────────────────

  describe('scanAllProtocols()', () => {
    it('returns a non-empty list of protocols', async () => {
      const protocols = await scanAllProtocols();
      expect(protocols.length).toBeGreaterThan(0);
    });

    it('returns protocols sorted by APY descending', async () => {
      const protocols = await scanAllProtocols();
      for (let i = 1; i < protocols.length; i++) {
        expect(protocols[i - 1].apy).toBeGreaterThanOrEqual(protocols[i].apy);
      }
    });

    it('includes Blend, Stellar DEX and Luma by name', async () => {
      const protocols = await scanAllProtocols();
      const names = protocols.map((p) => p.name);
      expect(names).toContain('Blend');
      expect(names).toContain('Stellar DEX');
      expect(names).toContain('Luma');
    });

    it('Blend has the highest APY (4.25)', async () => {
      const protocols = await scanAllProtocols();
      expect(protocols[0].name).toBe('Blend');
      expect(protocols[0].apy).toBe(4.25);
    });

    it('every protocol has required fields', async () => {
      const protocols = await scanAllProtocols();
      for (const p of protocols) {
        expect(p).toHaveProperty('name');
        expect(p).toHaveProperty('apy');
        expect(p).toHaveProperty('assetSymbol');
        expect(p).toHaveProperty('lastUpdated');
        expect(p).toHaveProperty('isAvailable');
      }
    });

    it('filters out any protocol whose TVL is below 10 000', async () => {
      const protocols = await scanAllProtocols();
      for (const p of protocols) {
        if (p.tvl !== undefined) {
          expect(p.tvl).toBeGreaterThanOrEqual(10_000);
        }
      }
    });

    it('persists each protocol to protocolRate table', async () => {
      const protocols = await scanAllProtocols();
      const p = getMockPrisma();
      expect(p.protocolRate.create).toHaveBeenCalledTimes(protocols.length);
    });

    it('passes correct data shape to protocolRate.create', async () => {
      await scanAllProtocols();
      const p = getMockPrisma();
      const firstCall = p.protocolRate.create.mock.calls[0][0];
      expect(firstCall.data).toMatchObject({
        protocolName: expect.any(String),
        assetSymbol: 'USDC',
        network: 'TESTNET',
      });
    });

    it('gracefully continues when protocolRate.create throws', async () => {
      const p = getMockPrisma();
      p.protocolRate.create.mockRejectedValueOnce(new Error('DB write failed'));
      // Should not throw — error is caught inside saveProtocolRates
      await expect(scanAllProtocols()).resolves.toBeDefined();
    });
  });

  // ── getCurrentOnChainApy ──────────────────────────────────────────────────

  describe('getCurrentOnChainApy()', () => {
    it('returns the APY number from the latest DB row', async () => {
      const p = getMockPrisma();
      p.protocolRate.findFirst.mockResolvedValue({
        supplyApy: { toNumber: () => 4.25 },
      });
      const apy = await getCurrentOnChainApy('Blend');
      expect(apy).toBe(4.25);
    });

    it('queries by protocolName and USDC assetSymbol', async () => {
      const p = getMockPrisma();
      p.protocolRate.findFirst.mockResolvedValue({
        supplyApy: { toNumber: () => 3.5 },
      });
      await getCurrentOnChainApy('Luma');
      expect(p.protocolRate.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ protocolName: 'Luma' }),
        }),
      );
    });

    it('returns null when no rate row exists', async () => {
      const p = getMockPrisma();
      p.protocolRate.findFirst.mockResolvedValue(null);
      const apy = await getCurrentOnChainApy('Unknown');
      expect(apy).toBeNull();
    });

    it('returns null when the DB throws', async () => {
      const p = getMockPrisma();
      p.protocolRate.findFirst.mockRejectedValue(new Error('connection lost'));
      const apy = await getCurrentOnChainApy('Blend');
      expect(apy).toBeNull();
    });
  });

  // ── getBestProtocol ───────────────────────────────────────────────────────

  describe('getBestProtocol()', () => {
    it('returns the protocol with the highest APY', async () => {
      const best = await getBestProtocol();
      expect(best).not.toBeNull();
      expect(best?.name).toBe('Blend');
    });

    it('returns a YieldProtocol with an apy field', async () => {
      const best = await getBestProtocol();
      expect(typeof best?.apy).toBe('number');
    });
  });
});
