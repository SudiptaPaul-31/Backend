# Quick Reference - Vault Events Persistence

## What Was Implemented

Idempotent vault contract event persistence with automatic deduplication and ledger cursor tracking.

## Key Files

| File | Purpose |
|------|---------|
| `prisma/schema.prisma` | Added EventCursor and ProcessedEvent models |
| `prisma/migrations/20260326152030_add_event_tracking/migration.sql` | Database migration |
| `src/stellar/events.ts` | Event persistence implementation |
| `tests/unit/stellar/events.test.ts` | Unit tests |
| `tests/integration/stellar/events.test.ts` | Integration tests |

## How It Works

### 1. Startup
```
Load last processed ledger from EventCursor table
├─ If found: Resume from that ledger
└─ If not found: Start from latest ledger
```

### 2. Polling
```
Every 5 seconds:
├─ Fetch events from RPC
├─ For each event:
│   ├─ Check if already processed (deduplication)
│   ├─ If new: Process and persist to database
│   └─ Mark as processed
└─ Update cursor with latest ledger
```

### 3. Event Processing
```
Deposit Event:
├─ Create/update Transaction (CONFIRMED)
├─ Create/update Position
└─ Link transaction to position

Withdraw Event:
├─ Create/update Transaction (CONFIRMED)
├─ Update Position (decrement amounts)
└─ Link transaction to position

Rebalance Event:
└─ Create ProtocolRate record
```

## Database Changes

### New Tables

**event_cursors**
- Stores last processed ledger per contract
- Enables resumption on restart

**processed_events**
- Stores processed event records
- Prevents duplicate processing
- Unique constraint: (contractId, txHash, eventType, ledger)

## Usage

### Start Listening
```typescript
import { startEventListener } from './src/stellar/events';
await startEventListener();
```

### Stop Listening
```typescript
import { stopEventListener } from './src/stellar/events';
stopEventListener();
```

### Check Status
```typescript
import { getLastProcessedLedger } from './src/stellar/events';
const ledger = getLastProcessedLedger();
```

## Testing

### Run Unit Tests
```bash
npm test -- tests/unit/stellar/events.test.ts --run
```

### Run Integration Tests
```bash
npm test -- tests/integration/stellar/events.test.ts --run
```

### Run All Tests
```bash
npm test -- --run
```

## Acceptance Criteria

✅ Deposit events mark transactions CONFIRMED and update balances
✅ Withdraw events update positions correctly
✅ Rebalance events record protocol rates
✅ No duplicate processing via deduplication
✅ Listener resumes from last processed ledger on restart
✅ All tests pass with proper mocking

## Key Features

| Feature | Implementation |
|---------|-----------------|
| Idempotency | Unique constraint on (contractId, txHash, eventType, ledger) |
| Deduplication | ProcessedEvent table check before processing |
| Cursor Persistence | EventCursor table stores lastProcessedLedger |
| Recovery | Load cursor on startup, resume from saved ledger |
| Error Handling | Graceful handling of missing users and errors |
| Logging | Comprehensive logging via centralized logger |

## Database Queries

### Check Cursor Status
```sql
SELECT * FROM event_cursors WHERE contractId = 'YOUR_CONTRACT_ID';
```

### Check Processed Events
```sql
SELECT COUNT(*) FROM processed_events;
SELECT * FROM processed_events ORDER BY processedAt DESC LIMIT 10;
```

### Check Transactions
```sql
SELECT * FROM transactions WHERE type = 'DEPOSIT' ORDER BY createdAt DESC;
SELECT * FROM transactions WHERE type = 'WITHDRAWAL' ORDER BY createdAt DESC;
```

### Check Positions
```sql
SELECT * FROM positions WHERE protocolName = 'vault' ORDER BY updatedAt DESC;
```

## Troubleshooting

### Events Not Processing
1. Check if listener is running: `getLastProcessedLedger()`
2. Check logs for errors
3. Verify VAULT_CONTRACT_ID is set
4. Check database connection

### Duplicate Events
1. Check ProcessedEvent table for duplicates
2. Verify unique constraint is in place
3. Check for concurrent listener instances

### Listener Not Resuming
1. Check EventCursor table for saved ledger
2. Verify database migration was applied
3. Check for database connection issues

## Performance

- Poll interval: 5 seconds
- Deduplication: O(1) via unique constraint
- User lookup: O(1) via walletAddress index
- Position lookup: O(1) via userId + protocolName index

## Security

- No sensitive data in logs
- Graceful error handling
- Database constraints enforce integrity
- Event listener runs as backend service

## Future Improvements

- Extract asset symbol and protocol from events
- Implement dead-letter queue for failed events
- Add metrics and monitoring
- Batch process events for better throughput
- Add event validation and schema checking

## Support

For issues or questions:
1. Check logs for error messages
2. Review database state
3. Check test cases for expected behavior
4. Refer to IMPLEMENTATION_DETAILS.md for comprehensive documentation
