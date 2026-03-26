import { PrismaClient, TransactionType, TransactionStatus } from '@prisma/client';
import * as stellarSdk from '@stellar/stellar-sdk';
import { startEventListener, stopEventListener, getLastProcessedLedger } from '../../../src/stellar/events';
import { getRpcServer } from '../../../src/stellar/client';

// Mock dependencies
jest.mock('../../../src/stellar/client');
jest.mock('../../../src/utils/logger');

const mockRpcServer = getRpcServer as jest.MockedFunction<typeof getRpcServer>;

describe('Vault Contract Events', () => {
    let prisma: PrismaClient;

    beforeAll(() => {
        prisma = new PrismaClient();
    });

    afterAll(async () => {
        await prisma.$disconnect();
    });

    beforeEach(async () => {
        // Clean up test data
        await prisma.processedEvent.deleteMany({});
        await prisma.eventCursor.deleteMany({});
        await prisma.transaction.deleteMany({});
        await prisma.position.deleteMany({});
        await prisma.user.deleteMany({});
    });

    describe('Event Persistence', () => {
        it('should persist deposit event to database', async () => {
            // Create test user
            const user = await prisma.user.create({
                data: {
                    walletAddress: 'GBUQWP3BOUZX34ULNQG23RQ6F4BVWCIBTICSQYY2T4YJJWUDLVXVVU6G',
                    network: 'MAINNET',
                },
            });

            // Mock RPC server
            const mockServer = {
                getLatestLedger: jest.fn().mockResolvedValue({ sequence: 100 }),
                getEvents: jest.fn().mockResolvedValue({
                    events: [
                        {
                            ledger: 99,
                            txHash: 'tx123',
                            contractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4',
                            topic: [
                                stellarSdk.nativeToScVal('deposit', { type: 'string' }),
                            ],
                            value: stellarSdk.nativeToScVal({
                                user: 'GBUQWP3BOUZX34ULNQG23RQ6F4BVWCIBTICSQYY2T4YJJWUDLVXVVU6G',
                                amount: 1000000000n,
                                shares: 1000000n,
                            }),
                        },
                    ],
                }),
            };

            mockRpcServer.mockReturnValue(mockServer as any);

            // Start listener
            await startEventListener();

            // Wait for event processing
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Verify transaction was created
            const transaction = await prisma.transaction.findFirst({
                where: { txHash: 'tx123' },
            });

            expect(transaction).toBeDefined();
            expect(transaction?.type).toBe(TransactionType.DEPOSIT);
            expect(transaction?.status).toBe(TransactionStatus.CONFIRMED);
            expect(transaction?.userId).toBe(user.id);

            // Verify position was created
            const position = await prisma.position.findFirst({
                where: { userId: user.id },
            });

            expect(position).toBeDefined();
            expect(position?.protocolName).toBe('vault');
            expect(position?.depositedAmount.toString()).toBe('1000000000');

            stopEventListener();
        });

        it('should persist withdraw event to database', async () => {
            // Create test user with existing position
            const user = await prisma.user.create({
                data: {
                    walletAddress: 'GBUQWP3BOUZX34ULNQG23RQ6F4BVWCIBTICSQYY2T4YJJWUDLVXVVU6G',
                    network: 'MAINNET',
                },
            });

            const position = await prisma.position.create({
                data: {
                    userId: user.id,
                    protocolName: 'vault',
                    assetSymbol: 'USDC',
                    depositedAmount: '5000000000',
                    currentValue: '5000000000',
                },
            });

            // Mock RPC server
            const mockServer = {
                getLatestLedger: jest.fn().mockResolvedValue({ sequence: 100 }),
                getEvents: jest.fn().mockResolvedValue({
                    events: [
                        {
                            ledger: 99,
                            txHash: 'tx456',
                            contractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4',
                            topic: [
                                stellarSdk.nativeToScVal('withdraw', { type: 'string' }),
                            ],
                            value: stellarSdk.nativeToScVal({
                                user: 'GBUQWP3BOUZX34ULNQG23RQ6F4BVWCIBTICSQYY2T4YJJWUDLVXVVU6G',
                                amount: 1000000000n,
                                shares: 1000000n,
                            }),
                        },
                    ],
                }),
            };

            mockRpcServer.mockReturnValue(mockServer as any);

            // Start listener
            await startEventListener();

            // Wait for event processing
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Verify transaction was created
            const transaction = await prisma.transaction.findFirst({
                where: { txHash: 'tx456' },
            });

            expect(transaction).toBeDefined();
            expect(transaction?.type).toBe(TransactionType.WITHDRAWAL);
            expect(transaction?.status).toBe(TransactionStatus.CONFIRMED);

            // Verify position was updated
            const updatedPosition = await prisma.position.findUnique({
                where: { id: position.id },
            });

            expect(updatedPosition?.depositedAmount.toString()).toBe('4000000000');
            expect(updatedPosition?.currentValue.toString()).toBe('4000000000');

            stopEventListener();
        });

        it('should persist rebalance event to database', async () => {
            // Mock RPC server
            const mockServer = {
                getLatestLedger: jest.fn().mockResolvedValue({ sequence: 100 }),
                getEvents: jest.fn().mockResolvedValue({
                    events: [
                        {
                            ledger: 99,
                            txHash: 'tx789',
                            contractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4',
                            topic: [
                                stellarSdk.nativeToScVal('rebalance', { type: 'string' }),
                            ],
                            value: stellarSdk.nativeToScVal({
                                protocol: 'aave',
                                apy: 500, // 5% in basis points
                                timestamp: Math.floor(Date.now() / 1000),
                            }),
                        },
                    ],
                }),
            };

            mockRpcServer.mockReturnValue(mockServer as any);

            // Start listener
            await startEventListener();

            // Wait for event processing
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Verify protocol rate was created
            const protocolRate = await prisma.protocolRate.findFirst({
                where: { protocolName: 'aave' },
            });

            expect(protocolRate).toBeDefined();
            expect(protocolRate?.supplyApy.toString()).toBe('5');
            expect(protocolRate?.assetSymbol).toBe('USDC');

            stopEventListener();
        });
    });

    describe('Idempotency', () => {
        it('should not process duplicate events', async () => {
            // Create test user
            const user = await prisma.user.create({
                data: {
                    walletAddress: 'GBUQWP3BOUZX34ULNQG23RQ6F4BVWCIBTICSQYY2T4YJJWUDLVXVVU6G',
                    network: 'MAINNET',
                },
            });

            // Create processed event record
            await prisma.processedEvent.create({
                data: {
                    contractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4',
                    txHash: 'tx123',
                    eventType: 'deposit',
                    ledger: 99,
                },
            });

            // Mock RPC server returning same event
            const mockServer = {
                getLatestLedger: jest.fn().mockResolvedValue({ sequence: 100 }),
                getEvents: jest.fn().mockResolvedValue({
                    events: [
                        {
                            ledger: 99,
                            txHash: 'tx123',
                            contractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4',
                            topic: [
                                stellarSdk.nativeToScVal('deposit', { type: 'string' }),
                            ],
                            value: stellarSdk.nativeToScVal({
                                user: 'GBUQWP3BOUZX34ULNQG23RQ6F4BVWCIBTICSQYY2T4YJJWUDLVXVVU6G',
                                amount: 1000000000n,
                                shares: 1000000n,
                            }),
                        },
                    ],
                }),
            };

            mockRpcServer.mockReturnValue(mockServer as any);

            // Start listener
            await startEventListener();

            // Wait for event processing
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Verify no new transaction was created
            const transactions = await prisma.transaction.findMany({
                where: { txHash: 'tx123' },
            });

            expect(transactions.length).toBe(0);

            stopEventListener();
        });
    });

    describe('Ledger Cursor Persistence', () => {
        it('should save last processed ledger to database', async () => {
            // Mock RPC server
            const mockServer = {
                getLatestLedger: jest.fn().mockResolvedValue({ sequence: 150 }),
                getEvents: jest.fn().mockResolvedValue({ events: [] }),
            };

            mockRpcServer.mockReturnValue(mockServer as any);

            // Start listener
            await startEventListener();

            // Wait for event processing
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Verify cursor was saved
            const cursor = await prisma.eventCursor.findUnique({
                where: { contractId: process.env.VAULT_CONTRACT_ID || '' },
            });

            expect(cursor).toBeDefined();
            expect(cursor?.lastProcessedLedger).toBe(150);

            stopEventListener();
        });

        it('should resume from saved ledger on restart', async () => {
            // Create saved cursor
            const contractId = process.env.VAULT_CONTRACT_ID || '';
            await prisma.eventCursor.create({
                data: {
                    contractId,
                    lastProcessedLedger: 100,
                },
            });

            // Mock RPC server
            const mockServer = {
                getLatestLedger: jest.fn().mockResolvedValue({ sequence: 150 }),
                getEvents: jest.fn().mockResolvedValue({ events: [] }),
            };

            mockRpcServer.mockReturnValue(mockServer as any);

            // Start listener
            await startEventListener();

            // Wait for initialization
            await new Promise(resolve => setTimeout(resolve, 500));

            // Verify it started from saved ledger
            expect(getLastProcessedLedger()).toBe(100);

            stopEventListener();
        });
    });
});
