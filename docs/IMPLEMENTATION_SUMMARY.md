# Vault Contract Events Persistence - Implementation Summary

## Overview
Implemented idempotent vault contract event persistence to Prisma database with ledger cursor tracking and deduplication.

## Changes Made

### 1. Database Schema Updates (`prisma/schema.prisma`)
Added two new models:

**EventCursor Model**
- Tracks the last processed ledger per contract
- Enables resumption from last known state on restart
- Unique constraint on contractId

**ProcessedEvent Model**
- Deduplication table storing processed events
- Unique constraint on (contractId, txHash, eventType, ledger)
- Prevents duplicate event processing

### 2. Migration (`prisma/migrations/20260326152030_add_event_tracking/migration.sql`)
- Created `event_cursors` table with proper indexes
- Created `processed_events` table with composite unique constraint
- Added indexes for efficient querying

### 3. Event Persistence Implementation (`src/stellar/events.ts`)

**Key Features:**

#### Idempotency
- Checks `ProcessedEvent` table before processing each event
- Skips duplicate events with same (contractId, txHash, eventType, ledger)
- Marks events as processed after successful handling

#### Ledger Cursor Persistence
- `loadLastProcessedLedger()`: Loads cursor from DB on startup
- `updateLastProcessedLedger()`: Persists cursor after each poll
- Resumes from last known ledger instead of latest on restart

#### Event Handlers

**handleDepositEvent()**
- Finds user by wallet address
- Creates/updates Transaction with CONFIRMED status
- Creates new Position or updates existing one
- Links transaction to position

**handleWithdrawEvent()**
- Finds user by wallet address
- Creates Transaction with CONFIRMED status
- Updates existing Position (decrements amounts)
- Links transaction to position

**handleRebalanceEvent()**
- Creates ProtocolRate record
- Logs rebalance information

#### Database Operations
- Uses Prisma upsert for idempotent transaction creation
- Atomic position updates with increment/decrement
- Proper error handling and logging

### 4. Unit Tests (`tests/unit/stellar/events.test.ts`)

**Test Coverage:**
- Event persistence (deposit, withdraw, rebalance)
- Idempotency checks
- Ledger cursor persistence
- Ledger resumption on restart

### 5. Integration Tests (`tests/integration/stellar/events.test.ts`)

**Test Coverage:**
- End-to-end deposit event processing
- Multiple sequential events
- Duplicate prevention on listener restart
- Error handling for missing users

## Acceptance Criteria Met

✅ **Event Persistence**
- Deposit events: Transaction marked CONFIRMED, user balance updated
- Withdraw events: Transaction marked CONFIRMED, position updated
- Rebalance events: Protocol rate recorded

✅ **Idempotency/Deduplication**
- Unique constraint on (contractId, txHash, eventType, ledger)
- Deduplication logic checks ProcessedEvent table
- No duplicate processing

✅ **Listener Cursor Persistence**
- EventCursor model stores lastProcessedLedger
- Loaded on startup for resumption
- Updated after each poll

✅ **Tests**
- Mock getRpcServer().getEvents()
- Verify correct Prisma updates
- Verify no duplicate processing
- Verify listener resumes correctly

## Database Schema Changes

```sql
-- New Tables
CREATE TABLE "event_cursors" (
  id TEXT PRIMARY KEY,
  contractId TEXT UNIQUE NOT NULL,
  lastProcessedLedger INTEGER NOT NULL,
  lastProcessedAt TIMESTAMP DEFAULT NOW(),
  updatedAt TIMESTAMP
);

CREATE TABLE "processed_events" (
  id TEXT PRIMARY KEY,
  contractId TEXT NOT NULL,
  txHash TEXT NOT NULL,
  eventType TEXT NOT NULL,
  ledger INTEGER NOT NULL,
  processedAt TIMESTAMP DEFAULT NOW(),
  UNIQUE(contractId, txHash, eventType, ledger)
);
```

## How It Works

1. **Startup**: Load last processed ledger from EventCursor table
2. **Poll Loop**: Fetch events from (lastProcessedLedger + 1)
3. **Deduplication**: Check if event exists in ProcessedEvent table
4. **Processing**: Handle deposit/withdraw/rebalance events
5. **Persistence**: 
   - Create/update Transaction
   - Create/update Position
   - Create ProtocolRate
6. **Mark Processed**: Insert into ProcessedEvent table
7. **Update Cursor**: Save new lastProcessedLedger to EventCursor

## Error Handling

- Gracefully handles missing users (logs warning, skips event)
- Catches and logs all errors during event processing
- Continues polling even if individual events fail
- Maintains cursor state for recovery

## Future Improvements

- Extract asset symbol and protocol name from event data
- Add network detection from event context
- Implement dead-letter queue for failed events
- Add metrics/monitoring for event processing
- Consider batch processing for high-volume events
