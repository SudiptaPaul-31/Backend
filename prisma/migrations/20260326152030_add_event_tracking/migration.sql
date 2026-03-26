-- CreateTable EventCursor
CREATE TABLE "event_cursors" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "lastProcessedLedger" INTEGER NOT NULL,
    "lastProcessedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_cursors_pkey" PRIMARY KEY ("id")
);

-- CreateTable ProcessedEvent
CREATE TABLE "processed_events" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "txHash" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "ledger" INTEGER NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processed_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "event_cursors_contractId_key" ON "event_cursors"("contractId");

-- CreateIndex
CREATE UNIQUE INDEX "processed_events_contractId_txHash_eventType_ledger_key" ON "processed_events"("contractId", "txHash", "eventType", "ledger");

-- CreateIndex
CREATE INDEX "processed_events_contractId_idx" ON "processed_events"("contractId");

-- CreateIndex
CREATE INDEX "processed_events_txHash_idx" ON "processed_events"("txHash");

-- CreateIndex
CREATE INDEX "processed_events_processedAt_idx" ON "processed_events"("processedAt");
