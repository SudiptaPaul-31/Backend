import { PrismaClient, TransactionType, TransactionStatus } from '@prisma/client';
import * as stellarSdk from '@stellar/stellar-sdk';
import { startEventListener, stopEventListener } from '../../../src/stellar/events';
import { getRpcServer } from '../../../src/stellar/client';

jest.mock('../../../src/stellar/client');
jest.mock('../../../src/utils/logger');

const mockRpcServer = getRpcServer as jest.MockedFunction<typeof getRpcServer>;

describe('Vault Events Integration Tests', () => {
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

    describe('End-to-End Event Processing', () => {
        it('should handle deposit event and update user balance', async () => {
            const walletAddress = 'GBUQWP3BOUZX34ULNQG23RQ6F4BVWCIBTICSQYY2T4YJJWUDLVXVVU6G';
            const depositAmount = 5000000000n; // 50 USDC

            // Create test user
            const user = await prisma.user.create({
                data: {
                    walletAddress,
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
                            txHash: 'deposit_tx_001',
                            contractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4',
                            topic: [
                                stellarSdk.nativeToScVal('deposit', { type: 'string' }),
                            ],
                            value: stellarSdk.nativeToScVal({
                                user: walletAddress,
                                amount: depositAmount,
                                shares: 5000000n,
                            }),
                        },
                    ],
                }),
            };

            mockRpcServer.mockReturnValue(mockServer as any);

            // Start listener
            await startEventListener();
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Verify transaction
            const transaction = await prisma.transaction.findUnique({
                where: { txHash: 'deposit_tx_001' },
            });

            expect(transaction).toBeDefined();
            expect(transaction?.type).toBe(TransactionType.DEPOSIT);
            expect(transaction?.status).toBe(TransactionStatus.CONFIRMED);
            expect(transaction?.amount.toString()).toBe(depositAmount.toString());
            expect(transaction?.userId).toBe(user.id);

            // Verify position
            const position = await prisma.position.findFirst({
                where: { userId: user.id },
            });

            expect(position).toBeDefined();
            expect(position?.depositedAmount.toString()).toBe(depositAmount.toString());
            expect(position?.currentValue.toString()).toBe(depositAmount.toString());

            stopEventListener();
        });

        it('should handle multiple sequential events correctly', async () => {
            const walletAddress = 'GBUQWP3BOUZX34ULNQG23RQ6F4BVWCIBTICSQYY2T4YJJWUDLVXVVU6G';

            // Create test user
            const user = await prisma.user.create({
                data: {
                    walletAddress,
                    network: 'MAINNET',
                },
            });

            // Mock RPC server with multiple events
            const mockServer = {
                getLatestLedger: jest.fn().mockResolvedValue({ sequence: 102 }),
                getEvents: jest.fn().mockResolvedValue({
                    events: [
                        {
                            ledger: 99,
                            txHash: 'tx_deposit_1',
                            contractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4',
                            topic: [
                                stellarSdk.nativeToScVal('deposit', { type: 'string' }),
                            ],
                            value: stellarSdk.nativeToScVal({
                                user: walletAddress,
                                amount: 5000000000n,
                                shares: 5000000n,
                            }),
                        },
                        {
                            ledger: 100,
                            txHash: 'tx_deposit_2',
                            contractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4',
                            topic: [
                                stellarSdk.nativeToScVal('deposit', { type: 'string' }),
                            ],
                            value: stellarSdk.nativeToScVal({
                                user: walletAddress,
                                amount: 3000000000n,
                                shares: 3000000n,
                            }),
                        },
                        {
                            ledger: 101,
                            txHash: 'tx_withdraw_1',
                            contractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4',
                            topic: [
                                stellarSdk.nativeToScVal('withdraw', { type: 'string' }),
                            ],
                            value: stellarSdk.nativeToScVal({
                                user: walletAddress,
                                amount: 2000000000n,
                                shares: 2000000n,
                            }),
                        },
                    ],
                }),
            };

            mockRpcServer.mockReturnValue(mockServer as any);

            // Start listener
            await startEventListener();
            await new Promise(resolve => setTimeout(resolve, 1500));

            // Verify all transactions were created
            const transactions = await prisma.transaction.findMany({
                where: { userId: user.id },
                orderBy: { createdAt: 'asc' },
            });

            expect(transactions.length).toBe(3);
            expect(transactions[0].type).toBe(TransactionType.DEPOSIT);
            expect(transactions[1].type).toBe(TransactionType.DEPOSIT);
            expect(transactions[2].type).toBe(TransactionType.WITHDRAWAL);

            // Verify final position balance
            const position = await prisma.position.findFirst({
                where: { userId: user.id },
            });

            // 5000000000 + 3000000000 - 2000000000 = 6000000000
            expect(position?.depositedAmount.toString()).toBe('6000000000');
            expect(position?.currentValue.toString()).toBe('6000000000');

            stopEventListener();
        });

        it('should prevent duplicate processing on listener restart', async () => {
            const walletAddress = 'GBUQWP3BOUZX34ULNQG23RQ6F4BVWCIBTICSQYY2T4YJJWUDLVXVVU6G';

            // Create test user
            const user = await prisma.user.create({
                data: {
                    walletAddress,
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
                            txHash: 'tx_unique_001',
                            contractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4',
                            topic: [
                                stellarSdk.nativeToScVal('deposit', { type: 'string' }),
                            ],
                            value: stellarSdk.nativeToScVal({
                                user: walletAddress,
                                amount: 5000000000n,
                                shares: 5000000n,
                            }),
                        },
                    ],
                }),
            };

            mockRpcServer.mockReturnValue(mockServer as any);

            // First run
            await startEventListener();
            await new Promise(resolve => setTimeout(resolve, 1000));
            stopEventListener();

            // Verify transaction was created
            let transactions = await prisma.transaction.findMany({
                where: { userId: user.id },
            });
            expect(transactions.length).toBe(1);

            // Second run - listener restarts
            await startEventListener();
            await new Promise(resolve => setTimeout(resolve, 1000));
            stopEventListener();

            // Verify no duplicate transaction was created
            transactions = await prisma.transaction.findMany({
                where: { userId: user.id },
            });
            expect(transactions.length).toBe(1);
        });
    });

    describe('Error Handling', () => {
        it('should handle missing user gracefully', async () => {
            // Mock RPC server with event for non-existent user
            const mockServer = {
                getLatestLedger: jest.fn().mockResolvedValue({ sequence: 100 }),
                getEvents: jest.fn().mockResolvedValue({
                    events: [
                        {
                            ledger: 99,
                            txHash: 'tx_unknown_user',
                            contractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4',
                            topic: [
                                stellarSdk.nativeToScVal('deposit', { type: 'string' }),
                            ],
                            value: stellarSdk.nativeToScVal({
                                user: 'GUNKNOWN_WALLET_ADDRESS',
                                amount: 5000000000n,
                                shares: 5000000n,
                            }),
                        },
                    ],
                }),
            };

            mockRpcServer.mockReturnValue(mockServer as any);

            // Start listener - should not crash
            await startEventListener();
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Verify no transaction was created
            const transactions = await prisma.transaction.findMany({});
            expect(transactions.length).toBe(0);

            stopEventListener();
        });
    });
});
