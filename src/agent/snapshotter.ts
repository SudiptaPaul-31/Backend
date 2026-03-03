/**
 * Snapshotter - Captures user balance snapshots for historical charting
 */

import { PrismaClient, Prisma } from '@prisma/client';
import { logger } from '../utils/logger';
import { UserBalance } from './types';

const prisma = new PrismaClient();

/**
 * Capture all user balance snapshots
 * Runs non-blocking to avoid delaying rebalance checks
 */
export async function captureAllUserBalances(): Promise<void> {
  try {
    const positions = await prisma.position.findMany({
      where: {
        status: 'ACTIVE',
      },
      include: {
        user: {
          select: {
            id: true,
            walletAddress: true,
          },
        },
      },
    });

    if (positions.length === 0) {
      logger.info('No active positions to snapshot');
      return;
    }

    logger.info('Starting balance snapshot', { positions: positions.length });

    // CRITICAL FIX: Use batch insert (createMany) instead of individual awaits
    // This scales much better as user base grows
    const snapshotData = positions.map(pos => {
      const yearsActive = calculateYearsActive(pos.openedAt);
      const apy = calculateApy(
        pos.depositedAmount.toNumber(),
        pos.yieldEarned.toNumber(),
        yearsActive
      );

      return {
        positionId: pos.id,
        apy: new Prisma.Decimal(apy),
        yieldAmount: pos.yieldEarned,
        principalAmount: pos.depositedAmount,
      };
    });

    // Single batch insert is much faster than individual creates
    if (snapshotData.length > 0) {
      await prisma.yieldSnapshot.createMany({
        data: snapshotData,
        skipDuplicates: false,
      });
    }

    logger.info('Balance snapshot complete', {
      snapshotCount: snapshotData.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Snapshot capture failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Calculate years a position has been active
 */
function calculateYearsActive(openedAt: Date): number {
  const now = new Date();
  const msPerYear = 365.25 * 24 * 60 * 60 * 1000;
  const yearsActive = (now.getTime() - openedAt.getTime()) / msPerYear;
  return Math.max(yearsActive, 1 / 365); // At least 1 day to avoid division by zero
}

/**
 * Calculate APY from principal and yield
 * APY = (yield / principal) / years * 100
 */
function calculateApy(principal: number, yieldEarned: number, years: number): number {
  if (principal <= 0 || years <= 0) return 0;
  return (yieldEarned / principal / years) * 100;
}

/**
 * Get balance history for a position
 */
export async function getPositionHistory(
  positionId: string,
  days: number = 30
): Promise<UserBalance[]> {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const snapshots = await prisma.yieldSnapshot.findMany({
      where: {
        positionId,
        snapshotAt: {
          gte: cutoffDate,
        },
      },
      orderBy: {
        snapshotAt: 'asc',
      },
    });

    return snapshots.map(snapshot => ({
      userId: '', // Would need to join with position
      walletAddress: '',
      positionId,
      protocolName: '', // Would need to join with position
      amount: snapshot.principalAmount.toString(),
      currentValue: snapshot.principalAmount.toString(), // Simplified
      apy: snapshot.apy.toNumber(),
      snapshotAt: snapshot.snapshotAt,
    }));
  } catch (error) {
    logger.error('Failed to get position history', {
      positionId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return [];
  }
}

/**
 * Cleanup old snapshots (older than 90 days)
 */
export async function cleanupOldSnapshots(retentionDays: number = 90): Promise<void> {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const deleted = await prisma.yieldSnapshot.deleteMany({
      where: {
        snapshotAt: {
          lt: cutoffDate,
        },
      },
    });

    if (deleted.count > 0) {
      logger.info('Old snapshots cleaned up', {
        count: deleted.count,
        cutoffDate: cutoffDate.toISOString(),
      });
    }
  } catch (error) {
    logger.error('Snapshot cleanup failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Get latest user balance snapshot
 */
export async function getLatestUserBalance(positionId: string): Promise<UserBalance | null> {
  try {
    const snapshot = await prisma.yieldSnapshot.findFirst({
      where: {
        positionId,
      },
      orderBy: {
        snapshotAt: 'desc',
      },
    });

    if (!snapshot) {
      return null;
    }

    return {
      userId: '',
      walletAddress: '',
      positionId,
      protocolName: '',
      amount: snapshot.principalAmount.toString(),
      currentValue: snapshot.principalAmount.toString(),
      apy: snapshot.apy.toNumber(),
      snapshotAt: snapshot.snapshotAt,
    };
  } catch (error) {
    logger.error('Failed to get latest user balance', {
      positionId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return null;
  }
}
