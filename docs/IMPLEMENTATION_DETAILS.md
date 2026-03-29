# Vault Contract Events Persistence - Implementation Details

## Issue #23: Persist Vault Contract Events into Prisma (Idempotent)

### Problem Statement
The vault contract event listener was fetching events but not persisting them to the database. There was no deduplication mechanism, no ledger cursor persistence, and no recovery capability on restart.

### Solution Overview
Implemented a complete event persistence layer with:
1. Idempotent event processing via deduplication
2. Ledger cursor persistence for recovery
3. Database models for tracking processed events
4. Event handlers for deposit, withdraw, and rebalance events
5. Comprehensive test coverage

---

## Implementation Details

### 1. Database Schema Changes

#### EventCursor Model
```prisma
model EventCursor {
  id                   String   @id @default(uuid())
  contractId           String   @unique
  lastProcessedLedger  Int
  lastProcessedAt      DateTime @default(now())
  updatedAt            DateTime @updatedAt

  @@map("event_cursors")
}
```
**Purpose**: Stores the last processed ledger sequence for each contract, enabling resumption on restart.

#### ProcessedEvent Model
```prisma
model ProcessedEvent {
  id           String   @id @default(uuid())
  contractId   String
  txHash       String
  eventType    String
  ledger       Int
  processedAt  DateTime @default(now())

  @@unique([contractId, txHash, eventType, ledger])
  @@index([contractId])
  @@index([txHash])
  @@index([processedAt])
  @@map("processed_events")
}
```
**Purpose**: Deduplication table preventing duplicate event processing.

### 2. Event Persistence Logic

#### Startup Flow
```
startEventListener()
  ↓
loadLastProcessedLedger()
  ↓
Check EventCursor table
  ├─ Found: Resume from saved ledger
  └─ Not found: Start from latest ledger
  ↓
Begin polling loop
```

#### Event Processing Flow
```
fetchEvents(startLedger)
  ↓
Get events from RPC
  ↓
For each event:
  ├─ Check ProcessedEvent table (deduplication)
  ├─ If duplicate: Skip
  ├─ If new:
  │   ├─ Parse event data
  │   ├─ Call appropriate handler (deposit/withdraw/rebalance)
  │   ├─ Create/update database records
  │   └─ Mark as processed in ProcessedEvent
  └─ Update EventCursor with new ledger
```

#### Deposit Event Handler
```typescript
handleDepositEvent(depositData, event)
  ├─ Find user by walletAddress
  ├─ Create/update Transaction
  │   ├─ Status: CONFIRMED
  │   ├─ Type: DEPOSIT
  │   └─ Link to user
  ├─ Find or create Position
  │   ├─ If exists: Increment depositedAmount and currentValue
  │   └─ If new: Create with initial amounts
  └─ Link transaction to position
```

#### Withdraw Event Handler
```typescript
handleWithdrawEvent(withdrawData, event)
  ├─ Find user by walletAddress
  ├─ Create/update Transaction
  │   ├─ Status: CONFIRMED
  │   ├─ Type: WITHDRAWAL
  │   └─ Link to user
  ├─ Find active position
  │   └─ Decrement depositedAmount and currentValue
  └─ Link transaction to position
```

#### Rebalance Event Handler
```typescript
handleRebalanceEvent(rebalanceData, event)
  └─ Create ProtocolRate record
      ├─ protocolName: from event
      ├─ supplyApy: from event
      └─ fetchedAt: current timestamp
```

### 3. Idempotency Mechanism

**Deduplication Key**: `(contractId, txHash, eventType, ledger)`

**Process**:
1. Before processing any event, query ProcessedEvent table
2. If record exists with same key, skip processing
3. After successful processing, insert into ProcessedEvent
4. Unique constraint prevents duplicate inserts

**Benefits**:
- Safe to replay events
- Handles listener restarts gracefully
- No duplicate transactions or position updates

### 4. Ledger Cursor Persistence

**Mechanism**:
1. On startup: Load lastProcessedLedger from EventCursor
2. During polling: Update EventCursor after each successful fetch
3. On restart: Resume from saved ledger, not latest

**Benefits**:
- No missed events on restart
- No duplicate processing of old events
- Efficient recovery

### 5. Error Handling

**Graceful Degradation**:
- Missing user: Log warning, skip event, continue processing
- Parse errors: Log error, mark as processed, continue
- Database errors: Log error, retry on next poll
- RPC errors: Log error, retry on next poll

**Logging**:
- All events logged with ledger and txHash
- Errors logged with context
- Duplicate skips logged for debugging

---

## Test Coverage

### Unit Tests (`tests/unit/stellar/events.test.ts`)

1. **Event Persistence**
   - Deposit event creates transaction and position
   - Withdraw event updates position
   - Rebalance event creates protocol rate

2. **Idempotency**
   - Duplicate events are skipped
   - No duplicate transactions created

3. **Ledger Cursor**
   - Cursor saved to database
   - Cursor loaded on restart
   - Listener resumes from saved ledger

### Integration Tests (`tests/integration/stellar/events.test.ts`)

1. **End-to-End Processing**
   - Deposit event updates user balance
   - Multiple sequential events processed correctly
   - Final position balance is accurate

2. **Duplicate Prevention**
   - Listener restart doesn't create duplicates
   - Same event processed only once

3. **Error Handling**
   - Missing user handled gracefully
   - No crashes on invalid data

---

## Database Migration

**File**: `prisma/migrations/20260326152030_add_event_tracking/migration.sql`

**Changes**:
- Create `event_cursors` table with unique constraint on contractId
- Create `processed_events` table with composite unique constraint
- Add indexes for efficient querying

**Rollback**: Prisma handles automatic rollback if needed

---

## Key Features

✅ **Idempotent Processing**
- Unique constraint prevents duplicates
- Safe to replay events
- Handles listener restarts

✅ **Ledger Cursor Persistence**
- Resumes from last known ledger
- No missed events
- Efficient recovery

✅ **Comprehensive Event Handling**
- Deposit: Creates transaction, updates position
- Withdraw: Creates transaction, updates position
- Rebalance: Records protocol rate

✅ **Error Resilience**
- Graceful handling of missing users
- Continues processing on errors
- Maintains cursor state

✅ **Well-Tested**
- Unit tests for core logic
- Integration tests for end-to-end flow
- Mock RPC for deterministic testing

---

## Usage

### Starting the Event Listener
```typescript
import { startEventListener } from './src/stellar/events';

// Start listening for events
await startEventListener();

// Listener will:
// 1. Load last processed ledger from DB
// 2. Resume from that ledger
// 3. Process new events
// 4. Persist to database
// 5. Update cursor
```

### Stopping the Event Listener
```typescript
import { stopEventListener } from './src/stellar/events';

stopEventListener();
```

### Checking Last Processed Ledger
```typescript
import { getLastProcessedLedger } from './src/stellar/events';

const ledger = getLastProcessedLedger();
console.log(`Last processed ledger: ${ledger}`);
```

---

## Future Improvements

1. **Extract Event Data**
   - Get asset symbol from event
   - Get protocol name from event
   - Get network from event context

2. **Dead-Letter Queue**
   - Store unparseable events
   - Retry mechanism for failed events
   - Manual intervention capability

3. **Metrics & Monitoring**
   - Event processing rate
   - Error rate
   - Ledger lag
   - Database performance

4. **Batch Processing**
   - Process multiple events in transaction
   - Reduce database round trips
   - Improve throughput

5. **Event Validation**
   - Schema validation for event data
   - Type checking
   - Range validation for amounts

---

## Files Modified/Created

### Modified
- `prisma/schema.prisma` - Added EventCursor and ProcessedEvent models

### Created
- `prisma/migrations/20260326152030_add_event_tracking/migration.sql` - Database migration
- `src/stellar/events.ts` - Complete event persistence implementation
- `tests/unit/stellar/events.test.ts` - Unit tests
- `tests/integration/stellar/events.test.ts` - Integration tests

---

## Acceptance Criteria Verification

| Criteria | Status | Evidence |
|----------|--------|----------|
| Deposit event: Transaction marked CONFIRMED | ✅ | handleDepositEvent creates CONFIRMED transaction |
| Deposit event: User balance updated | ✅ | Position.depositedAmount incremented |
| Withdraw event: Same correctness | ✅ | handleWithdrawEvent creates CONFIRMED transaction, decrements position |
| Re-running listener: No duplicate updates | ✅ | ProcessedEvent deduplication prevents duplicates |
| Listener resumes correctly after restart | ✅ | EventCursor persists and loads lastProcessedLedger |
| Tests mock getRpcServer().getEvents() | ✅ | Unit and integration tests mock RPC |
| Tests verify correct Prisma updates | ✅ | Tests check transaction and position records |
| Tests verify no duplicate processing | ✅ | Idempotency tests verify deduplication |

---

## Deployment Notes

1. Run migration: `npx prisma migrate deploy`
2. Restart event listener
3. Monitor logs for successful event processing
4. Verify EventCursor and ProcessedEvent tables are populated
5. Test with manual event injection if needed

---

## Support & Debugging

### Check Event Processing Status
```sql
SELECT * FROM event_cursors WHERE contractId = 'YOUR_CONTRACT_ID';
SELECT COUNT(*) FROM processed_events;
SELECT * FROM processed_events ORDER BY processedAt DESC LIMIT 10;
```

### Monitor Event Processing
```typescript
const cursor = await prisma.eventCursor.findUnique({
  where: { contractId: VAULT_CONTRACT_ID }
});
console.log(`Last processed ledger: ${cursor?.lastProcessedLedger}`);
```

### Reset Event Processing (Development Only)
```typescript
// Delete cursor to restart from latest
await prisma.eventCursor.delete({
  where: { contractId: VAULT_CONTRACT_ID }
});

// Delete processed events to reprocess
await prisma.processedEvent.deleteMany({
  where: { contractId: VAULT_CONTRACT_ID }
});
```
