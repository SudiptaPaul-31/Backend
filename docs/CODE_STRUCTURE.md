# Code Structure - Vault Events Persistence

## File Organization

```
workspace/
├── prisma/
│   ├── schema.prisma                          # Updated with EventCursor & ProcessedEvent
│   └── migrations/
│       └── 20260326152030_add_event_tracking/
│           └── migration.sql                  # Database migration
├── src/
│   └── stellar/
│       └── events.ts                          # Event persistence implementation
└── tests/
    ├── unit/
    │   └── stellar/
    │       └── events.test.ts                 # Unit tests
    └── integration/
        └── stellar/
            └── events.test.ts                 # Integration tests
```

## Core Implementation: src/stellar/events.ts

### Imports & Setup
```typescript
import { PrismaClient, TransactionType, TransactionStatus } from '@prisma/client';
import { getRpcServer } from './client';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();
let lastProcessedLedger = 0;
let isListening = false;
```

### Key Functions

#### 1. Event Parsing
```typescript
parseDepositEvent(event)      // Extract deposit data
parseWithdrawEvent(event)     // Extract withdraw data
parseRebalanceEvent(event)    // Extract rebalance data
```

#### 2. Event Handlers
```typescript
handleDepositEvent(depositData, event)      // Persist deposit
handleWithdrawEvent(withdrawData, event)    // Persist withdraw
handleRebalanceEvent(rebalanceData, event)  // Persist rebalance
```

#### 3. Main Event Handler
```typescript
handleEvent(event)  // Orchestrates deduplication and routing
```

#### 4. Ledger Management
```typescript
loadLastProcessedLedger()        // Load from DB
updateLastProcessedLedger(ledger) // Save to DB
```

#### 5. Event Fetching
```typescript
fetchEvents(startLedger)  // Poll RPC and process events
```

#### 6. Listener Control
```typescript
startEventListener()   // Initialize and start polling
stopEventListener()    // Stop polling
getLastProcessedLedger() // Get current ledger
```

## Database Schema

### EventCursor Table
```sql
CREATE TABLE event_cursors (
  id TEXT PRIMARY KEY,
  contractId TEXT UNIQUE NOT NULL,
  lastProcessedLedger INTEGER NOT NULL,
  lastProcessedAt TIMESTAMP DEFAULT NOW(),
  updatedAt TIMESTAMP
);
```

### ProcessedEvent Table
```sql
CREATE TABLE processed_events (
  id TEXT PRIMARY KEY,
  contractId TEXT NOT NULL,
  txHash TEXT NOT NULL,
  eventType TEXT NOT NULL,
  ledger INTEGER NOT NULL,
  processedAt TIMESTAMP DEFAULT NOW(),
  UNIQUE(contractId, txHash, eventType, ledger)
);
```

## Data Flow

### Startup Sequence
```
startEventListener()
  ├─ Check if already running
  ├─ Validate VAULT_CONTRACT_ID
  ├─ Load lastProcessedLedger from EventCursor
  ├─ Start polling loop
  └─ Poll every 5 seconds
```

### Event Processing Sequence
```
fetchEvents(startLedger)
  ├─ Get latest ledger from RPC
  ├─ Fetch events from startLedger to latest
  ├─ For each event:
  │   ├─ Parse event type
  │   ├─ Call handleEvent()
  │   │   ├─ Check ProcessedEvent (deduplication)
  │   │   ├─ Route to handler (deposit/withdraw/rebalance)
  │   │   ├─ Create/update database records
  │   │   └─ Mark as processed
  │   └─ Continue to next event
  └─ Update EventCursor with latest ledger
```

### Deposit Event Processing
```
handleDepositEvent(depositData, event)
  ├─ Find user by walletAddress
  ├─ Upsert transaction
  │   ├─ If exists: Update status to CONFIRMED
  │   └─ If new: Create with CONFIRMED status
  ├─ Find or create position
  │   ├─ If exists: Increment amounts
  │   └─ If new: Create with initial amounts
  └─ Link transaction to position
```

### Withdraw Event Processing
```
handleWithdrawEvent(withdrawData, event)
  ├─ Find user by walletAddress
  ├─ Upsert transaction
  │   ├─ If exists: Update status to CONFIRMED
  │   └─ If new: Create with CONFIRMED status
  ├─ Find active position
  │   └─ Decrement amounts
  └─ Link transaction to position
```

### Rebalance Event Processing
```
handleRebalanceEvent(rebalanceData, event)
  └─ Create ProtocolRate record
      ├─ protocolName from event
      ├─ supplyApy from event
      └─ fetchedAt as current time
```

## Test Structure

### Unit Tests (tests/unit/stellar/events.test.ts)

**Test Suites:**
1. Event Persistence
   - Deposit event persistence
   - Withdraw event persistence
   - Rebalance event persistence

2. Idempotency
   - Duplicate event skipping

3. Ledger Cursor Persistence
   - Cursor saving
   - Cursor loading on restart

### Integration Tests (tests/integration/stellar/events.test.ts)

**Test Suites:**
1. End-to-End Event Processing
   - Deposit event with balance update
   - Multiple sequential events
   - Duplicate prevention on restart

2. Error Handling
   - Missing user handling

## Key Design Decisions

### 1. Deduplication Strategy
- **Approach**: Unique constraint on (contractId, txHash, eventType, ledger)
- **Rationale**: Prevents duplicate processing at database level
- **Benefit**: Idempotent even if event handler is called multiple times

### 2. Ledger Cursor Persistence
- **Approach**: EventCursor table with one record per contract
- **Rationale**: Enables recovery from exact point of failure
- **Benefit**: No missed or duplicate events on restart

### 3. Event Handler Separation
- **Approach**: Separate handlers for each event type
- **Rationale**: Clear separation of concerns
- **Benefit**: Easy to test and maintain

### 4. Upsert for Transactions
- **Approach**: Use Prisma upsert for transaction creation
- **Rationale**: Handles both new and existing transactions
- **Benefit**: Idempotent transaction updates

### 5. Logging Strategy
- **Approach**: Use centralized logger for all events
- **Rationale**: Consistent logging across application
- **Benefit**: Easy debugging and monitoring

## Error Handling Strategy

### Missing User
```typescript
if (!user) {
  logger.warn(`User not found for wallet: ${walletAddress}`);
  return; // Skip event, continue processing
}
```

### Database Errors
```typescript
try {
  // Database operation
} catch (error) {
  logger.error(`Error: ${error.message}`);
  // Error is logged, event not marked as processed
  // Will be retried on next poll
}
```

### RPC Errors
```typescript
try {
  const events = await server.getEvents(...);
} catch (error) {
  logger.error(`RPC Error: ${error.message}`);
  // Error is logged, polling continues
  // Will retry on next poll
}
```

## Performance Considerations

### Database Indexes
- `event_cursors.contractId` - Unique index for fast lookup
- `processed_events.contractId` - Index for deduplication check
- `processed_events.txHash` - Index for transaction lookup
- `processed_events.processedAt` - Index for time-based queries

### Query Optimization
- Deduplication check uses unique constraint (O(1))
- User lookup uses walletAddress index (O(1))
- Position lookup uses userId + protocolName (O(1))

### Polling Strategy
- 5-second poll interval balances responsiveness and load
- Batch processing of multiple events per poll
- Cursor persistence reduces redundant queries

## Security Considerations

### Data Validation
- User wallet address validation via database lookup
- Event type validation against known types
- Amount validation (non-negative)

### Access Control
- Event listener runs as backend service
- No direct user access to event processing
- Database constraints enforce data integrity

### Error Handling
- No sensitive data in error logs
- Graceful degradation on errors
- No crashes or data corruption

## Monitoring & Debugging

### Key Metrics
- Last processed ledger
- Events processed per poll
- Error rate
- Processing latency

### Debug Queries
```sql
-- Check cursor status
SELECT * FROM event_cursors;

-- Check processed events
SELECT COUNT(*) FROM processed_events;

-- Check recent transactions
SELECT * FROM transactions ORDER BY createdAt DESC LIMIT 10;

-- Check for stuck events
SELECT * FROM processed_events 
WHERE processedAt < NOW() - INTERVAL '1 hour'
ORDER BY processedAt DESC;
```

## Future Extensibility

### Adding New Event Types
1. Add parser function: `parseNewEvent(event)`
2. Add handler function: `handleNewEvent(data, event)`
3. Add case in `handleEvent()` switch statement
4. Add tests for new event type

### Adding New Database Models
1. Update Prisma schema
2. Create migration
3. Update event handlers to persist to new model
4. Add tests for new persistence

### Improving Error Handling
1. Implement dead-letter queue
2. Add retry logic with exponential backoff
3. Add alerting for critical errors
4. Add metrics collection
