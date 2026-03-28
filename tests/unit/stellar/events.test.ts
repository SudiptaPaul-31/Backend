import { createMockDb } from '../../helpers/testDb';

// Mock Prisma before importing events
const mockPrisma = createMockDb();
jest.mock('@prisma/client', () => {
    const actual = jest.requireActual('@prisma/client');
    return {
        ...actual,
        PrismaClient: jest.fn(() => mockPrisma),
    };
});

jest.mock('../../../src/stellar/client');
jest.mock('../../../src/utils/logger');

import { TransactionType, TransactionStatus } from '@prisma/client';
import * as stellarSdk from '@stellar/stellar-sdk';
import { startEventListener, stopEventListener } from '../../../src/stellar/events';
import { getRpcServer } from '../../../src/stellar/client';

const mockRpcServer = getRpcServer as jest.MockedFunction<typeof getRpcServer>;

describe('Vault Contract Events', () => {
    beforeEach(async () => {
        // Reset all mocks
        jest.clearAllMocks();
    });

    afterEach(() => {
        stopEventListener();
    });

    describe('Event Listener', () => {
        it('should start and stop without errors', async () => {
            // Mock RPC server
            const mockServer = {
                getLatestLedger: jest.fn().mockResolvedValue({ sequence: 100 }),
                getEvents: jest.fn().mockResolvedValue({ events: [] }),
            };

            mockRpcServer.mockReturnValue(mockServer as any);

            // Start listener
            await startEventListener();
            await new Promise(resolve => setTimeout(resolve, 100));

            // Verify RPC was called
            expect(mockServer.getLatestLedger).toHaveBeenCalled();

            stopEventListener();
        });

        it('should handle deposit events', async () => {
            const walletAddress = 'GBUQWP3BOUZX34ULNQG23RQ6F4BVWCIBTICSQYY2T4YJJWUDLVXVVU6G';

            // Mock RPC server with deposit event
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
                                user: walletAddress,
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
            await new Promise(resolve => setTimeout(resolve, 100));

            // Verify RPC was called
            expect(mockServer.getLatestLedger).toHaveBeenCalled();
            expect(mockServer.getEvents).toHaveBeenCalled();

            stopEventListener();
        });

        it('should handle withdraw events', async () => {
            const walletAddress = 'GBUQWP3BOUZX34ULNQG23RQ6F4BVWCIBTICSQYY2T4YJJWUDLVXVVU6G';

            // Mock RPC server with withdraw event
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
                                user: walletAddress,
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
            await new Promise(resolve => setTimeout(resolve, 100));

            // Verify RPC was called
            expect(mockServer.getLatestLedger).toHaveBeenCalled();
            expect(mockServer.getEvents).toHaveBeenCalled();

            stopEventListener();
        });

        it('should handle rebalance events', async () => {
            // Mock RPC server with rebalance event
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
                                apy: 500,
                                timestamp: Math.floor(Date.now() / 1000),
                            }),
                        },
                    ],
                }),
            };

            mockRpcServer.mockReturnValue(mockServer as any);

            // Start listener
            await startEventListener();
            await new Promise(resolve => setTimeout(resolve, 100));

            // Verify RPC was called
            expect(mockServer.getLatestLedger).toHaveBeenCalled();
            expect(mockServer.getEvents).toHaveBeenCalled();

            stopEventListener();
        });

        it('should handle multiple sequential events', async () => {
            const walletAddress = 'GBUQWP3BOUZX34ULNQG23RQ6F4BVWCIBTICSQYY2T4YJJWUDLVXVVU6G';

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
            await new Promise(resolve => setTimeout(resolve, 100));

            // Verify RPC was called
            expect(mockServer.getLatestLedger).toHaveBeenCalled();
            expect(mockServer.getEvents).toHaveBeenCalled();

            stopEventListener();
        });


    });
});
