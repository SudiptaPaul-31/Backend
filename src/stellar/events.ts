import { rpc, scValToNative, xdr } from '@stellar/stellar-sdk';
import { PrismaClient, TransactionType, TransactionStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { getRpcServer } from './client';
import { ContractEvent, DepositEvent, WithdrawEvent, RebalanceEvent } from './types';
import { logger } from '../utils/logger';

const VAULT_CONTRACT_ID = process.env.VAULT_CONTRACT_ID || '';
const POLL_INTERVAL_MS = 5000;

const prisma = new PrismaClient();

let lastProcessedLedger = 0;
let isListening = false;

/**
 * Parse deposit event
 */
function parseDepositEvent(event: ContractEvent): DepositEvent {
  const data = scValToNative(event.value);
  return {
    user: data.user,
    amount: data.amount?.toString() || '0',
    shares: data.shares?.toString() || '0',
  };
}

/**
 * Parse withdraw event
 */
function parseWithdrawEvent(event: ContractEvent): WithdrawEvent {
  const data = scValToNative(event.value);
  return {
    user: data.user,
    amount: data.amount?.toString() || '0',
    shares: data.shares?.toString() || '0',
  };
}

/**
 * Parse rebalance event
 */
function parseRebalanceEvent(event: ContractEvent): RebalanceEvent {
  const data = scValToNative(event.value);
  return {
    protocol: data.protocol,
    apy: data.apy / 100, // Convert basis points to percentage
    timestamp: data.timestamp,
  };
}

/**
 * Handle deposit event - persist to database
 */
async function handleDepositEvent(depositData: DepositEvent, event: ContractEvent): Promise<void> {
  // Find user by wallet address
  const user = await prisma.user.findUnique({
    where: { walletAddress: depositData.user },
  });

  if (!user) {
    logger.warn(`[Deposit] User not found for wallet: ${depositData.user}`);
    return;
  }

  // Create or update transaction
  const transaction = await prisma.transaction.upsert({
    where: { txHash: event.txHash },
    update: {
      status: TransactionStatus.CONFIRMED,
      confirmedAt: new Date(),
    },
    create: {
      userId: user.id,
      txHash: event.txHash,
      type: TransactionType.DEPOSIT,
      status: TransactionStatus.CONFIRMED,
      assetSymbol: 'USDC', // TODO: Extract from event if available
      amount: depositData.amount,
      network: user.network,
      confirmedAt: new Date(),
    },
  });

  // Find or create position
  const position = await prisma.position.findFirst({
    where: {
      userId: user.id,
      protocolName: 'vault', // TODO: Extract from event if available
      status: 'ACTIVE',
    },
  });

  if (position) {
    // Update existing position
    await prisma.position.update({
      where: { id: position.id },
      data: {
        depositedAmount: {
          increment: depositData.amount,
        },
        currentValue: {
          increment: depositData.amount,
        },
        updatedAt: new Date(),
      },
    });

    // Link transaction to position
    await prisma.transaction.update({
      where: { id: transaction.id },
      data: { positionId: position.id },
    });
  } else {
    // Create new position
    const newPosition = await prisma.position.create({
      data: {
        userId: user.id,
        protocolName: 'vault',
        assetSymbol: 'USDC',
        depositedAmount: depositData.amount,
        currentValue: depositData.amount,
        yieldEarned: 0,
      },
    });

    // Link transaction to position
    await prisma.transaction.update({
      where: { id: transaction.id },
      data: { positionId: newPosition.id },
    });
  }
}

/**
 * Handle withdraw event - persist to database
 */
async function handleWithdrawEvent(withdrawData: WithdrawEvent, event: ContractEvent): Promise<void> {
  // Find user by wallet address
  const user = await prisma.user.findUnique({
    where: { walletAddress: withdrawData.user },
  });

  if (!user) {
    logger.warn(`[Withdraw] User not found for wallet: ${withdrawData.user}`);
    return;
  }

  // Create transaction
  const transaction = await prisma.transaction.upsert({
    where: { txHash: event.txHash },
    update: {
      status: TransactionStatus.CONFIRMED,
      confirmedAt: new Date(),
    },
    create: {
      userId: user.id,
      txHash: event.txHash,
      type: TransactionType.WITHDRAWAL,
      status: TransactionStatus.CONFIRMED,
      assetSymbol: 'USDC',
      amount: withdrawData.amount,
      network: user.network,
      confirmedAt: new Date(),
    },
  });

  // Find active position
  const position = await prisma.position.findFirst({
    where: {
      userId: user.id,
      protocolName: 'vault',
      status: 'ACTIVE',
    },
  });

  if (position) {
    // Update position
    const newDepositedAmount = new Decimal(position.depositedAmount).minus(withdrawData.amount);
    const newCurrentValue = new Decimal(position.currentValue).minus(withdrawData.amount);

    await prisma.position.update({
      where: { id: position.id },
      data: {
        depositedAmount: newDepositedAmount,
        currentValue: newCurrentValue,
        updatedAt: new Date(),
      },
    });

    // Link transaction to position
    await prisma.transaction.update({
      where: { id: transaction.id },
      data: { positionId: position.id },
    });
  }
}

/**
 * Handle rebalance event - persist to database
 */
async function handleRebalanceEvent(rebalanceData: RebalanceEvent, event: ContractEvent): Promise<void> {
  // Create protocol rate record
  await prisma.protocolRate.create({
    data: {
      protocolName: rebalanceData.protocol,
      assetSymbol: 'USDC',
      supplyApy: rebalanceData.apy,
      network: 'MAINNET', // TODO: Get from config
      fetchedAt: new Date(),
    },
  });

  logger.info(`[Rebalance] Recorded protocol rate for ${rebalanceData.protocol} at ${rebalanceData.apy}%`);
}

/**
 * Handle contract event with persistence and idempotency
 */
async function handleEvent(event: ContractEvent): Promise<void> {
  try {
    logger.info(`[Event] ${event.type} detected at ledger ${event.ledger}, tx: ${event.txHash}`);

    // Check if event was already processed (idempotency)
    const existingEvent = await prisma.processedEvent.findUnique({
      where: {
        contractId_txHash_eventType_ledger: {
          contractId: event.contractId,
          txHash: event.txHash,
          eventType: event.type,
          ledger: event.ledger,
        },
      },
    });

    if (existingEvent) {
      logger.info(`[Event] Skipping duplicate event: ${event.type} at ledger ${event.ledger}`);
      return;
    }

    switch (event.type) {
      case 'deposit': {
        const depositData = parseDepositEvent(event);
        logger.info(`[Deposit] User: ${depositData.user}, Amount: ${depositData.amount}, Shares: ${depositData.shares}`);
        await handleDepositEvent(depositData, event);
        break;
      }

      case 'withdraw': {
        const withdrawData = parseWithdrawEvent(event);
        logger.info(`[Withdraw] User: ${withdrawData.user}, Amount: ${withdrawData.amount}, Shares: ${withdrawData.shares}`);
        await handleWithdrawEvent(withdrawData, event);
        break;
      }

      case 'rebalance': {
        const rebalanceData = parseRebalanceEvent(event);
        logger.info(`[Rebalance] Protocol: ${rebalanceData.protocol}, APY: ${rebalanceData.apy}%`);
        await handleRebalanceEvent(rebalanceData, event);
        break;
      }
    }

    // Mark event as processed
    await prisma.processedEvent.create({
      data: {
        contractId: event.contractId,
        txHash: event.txHash,
        eventType: event.type,
        ledger: event.ledger,
      },
    });

    logger.info(`[Event] Successfully processed ${event.type} event`);
  } catch (error) {
    logger.error(`[Event Error] Failed to handle ${event.type}:`, error instanceof Error ? error.message : 'Unknown error');
  }
}

/**
 * Load last processed ledger from database
 */
async function loadLastProcessedLedger(): Promise<number> {
  const cursor = await prisma.eventCursor.findUnique({
    where: { contractId: VAULT_CONTRACT_ID },
  });

  if (cursor) {
    logger.info(`[Event Listener] Resuming from ledger ${cursor.lastProcessedLedger}`);
    return cursor.lastProcessedLedger;
  }

  // First time - start from latest
  const server = getRpcServer();
  const latestLedger = await server.getLatestLedger();
  logger.info(`[Event Listener] First run, starting from ledger ${latestLedger.sequence}`);
  return latestLedger.sequence;
}

/**
 * Update last processed ledger in database
 */
async function updateLastProcessedLedger(ledger: number): Promise<void> {
  await prisma.eventCursor.upsert({
    where: { contractId: VAULT_CONTRACT_ID },
    update: {
      lastProcessedLedger: ledger,
      lastProcessedAt: new Date(),
    },
    create: {
      contractId: VAULT_CONTRACT_ID,
      lastProcessedLedger: ledger,
    },
  });
}

/**
 * Fetch and process events from ledger range
 */
async function fetchEvents(startLedger: number): Promise<void> {
  const server = getRpcServer();

  try {
    const latestLedger = await server.getLatestLedger();

    if (startLedger >= latestLedger.sequence) {
      return; // No new ledgers
    }

    const events = await server.getEvents({
      startLedger,
      filters: [
        {
          type: 'contract',
          contractIds: [VAULT_CONTRACT_ID],
        },
      ],
    });

    for (const event of events.events) {
      const topics = event.topic;
      const eventType = topics.length > 0 ? scValToNative(topics[0]) : null;

      if (['deposit', 'withdraw', 'rebalance'].includes(eventType)) {
        const contractEvent: ContractEvent = {
          type: eventType as 'deposit' | 'withdraw' | 'rebalance',
          ledger: event.ledger,
          txHash: event.txHash,
          contractId: typeof event.contractId === 'string' ? event.contractId : VAULT_CONTRACT_ID,
          topics: topics,
          value: event.value,
        };

        await handleEvent(contractEvent);
      }
    }

    // Update cursor in database
    await updateLastProcessedLedger(latestLedger.sequence);
    lastProcessedLedger = latestLedger.sequence;
  } catch (error) {
    logger.error('[Event Listener] Error fetching events:', error instanceof Error ? error.message : 'Unknown error');
  }
}

/**
 * Start event listener
 */
export async function startEventListener(): Promise<void> {
  if (isListening) {
    logger.warn('[Event Listener] Already running');
    return;
  }

  if (!VAULT_CONTRACT_ID) {
    throw new Error('VAULT_CONTRACT_ID not configured');
  }

  isListening = true;

  // Load last processed ledger from database
  lastProcessedLedger = await loadLastProcessedLedger();

  logger.info(`[Event Listener] Started at ledger ${lastProcessedLedger}`);

  // Poll loop
  const poll = async () => {
    if (!isListening) return;

    try {
      await fetchEvents(lastProcessedLedger + 1);
    } catch (error) {
      logger.error('[Event Listener] Poll error:', error instanceof Error ? error.message : 'Unknown error');
    }

    setTimeout(poll, POLL_INTERVAL_MS);
  };

  poll();
}

/**
 * Stop event listener
 */
export function stopEventListener(): void {
  isListening = false;
  logger.info('[Event Listener] Stopped');
}

/**
 * Get last processed ledger
 */
export function getLastProcessedLedger(): number {
  return lastProcessedLedger;
}
