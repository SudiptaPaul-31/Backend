import { rpc, scValToNative, xdr } from '@stellar/stellar-sdk';
import { getRpcServer } from './client';
import { ContractEvent, DepositEvent, WithdrawEvent, RebalanceEvent } from './types';

const VAULT_CONTRACT_ID = process.env.VAULT_CONTRACT_ID || '';
const POLL_INTERVAL_MS = 5000;

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
 * Handle contract event
 */
async function handleEvent(event: ContractEvent): Promise<void> {
  try {
    console.log(`[Event] ${event.type} detected at ledger ${event.ledger}, tx: ${event.txHash}`);
    
    switch (event.type) {
      case 'deposit': {
        const depositData = parseDepositEvent(event);
        console.log(`[Deposit] User: ${depositData.user}, Amount: ${depositData.amount}, Shares: ${depositData.shares}`);
        // TODO: Update database with deposit
        break;
      }
      
      case 'withdraw': {
        const withdrawData = parseWithdrawEvent(event);
        console.log(`[Withdraw] User: ${withdrawData.user}, Amount: ${withdrawData.amount}, Shares: ${withdrawData.shares}`);
        // TODO: Update database with withdrawal
        break;
      }
      
      case 'rebalance': {
        const rebalanceData = parseRebalanceEvent(event);
        console.log(`[Rebalance] Protocol: ${rebalanceData.protocol}, APY: ${rebalanceData.apy}%`);
        // TODO: Update database with rebalance info
        break;
      }
    }
  } catch (error) {
    console.error(`[Event Error] Failed to handle ${event.type}:`, error instanceof Error ? error.message : 'Unknown error');
  }
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
    
    lastProcessedLedger = latestLedger.sequence;
  } catch (error) {
    console.error('[Event Listener] Error fetching events:', error instanceof Error ? error.message : 'Unknown error');
  }
}

/**
 * Start event listener
 */
export async function startEventListener(): Promise<void> {
  if (isListening) {
    console.warn('[Event Listener] Already running');
    return;
  }
  
  if (!VAULT_CONTRACT_ID) {
    throw new Error('VAULT_CONTRACT_ID not configured');
  }
  
  isListening = true;
  
  // Initialize starting ledger
  const server = getRpcServer();
  const latestLedger = await server.getLatestLedger();
  lastProcessedLedger = latestLedger.sequence;
  
  console.log(`[Event Listener] Started at ledger ${lastProcessedLedger}`);
  
  // Poll loop
  const poll = async () => {
    if (!isListening) return;
    
    try {
      await fetchEvents(lastProcessedLedger + 1);
    } catch (error) {
      console.error('[Event Listener] Poll error:', error instanceof Error ? error.message : 'Unknown error');
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
  console.log('[Event Listener] Stopped');
}

/**
 * Get last processed ledger
 */
export function getLastProcessedLedger(): number {
  return lastProcessedLedger;
}
