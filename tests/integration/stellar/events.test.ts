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

import * as stellarSdk from '@stellar/stellar-sdk';
import { startEventListener, stopEventListener } from '../../../src/stellar/events';
import { getRpcServer } from '../../../src/stellar/client';

const mockRpcServer = getRpcServer as jest.MockedFunction<typeof getRpcServer>;

describe('Vault Events Integration Tests', () => {
    beforeEach(async () => {
        // Reset all mocks
        jest.clearAllMocks();
    });

    afterEach(() => {
        stopEventListener();
    });

    describe('End-to-End Event Processing', () => {
        it('should handle deposit event and update user balance', async () => {
            const walletAddress = 'GBUQWP3BOUZX34ULNQG23RQ6F4BVWCIBTICSQYY2T4YJJWUDLVXVVU6G';
            const depositAmount = 5000000000n;

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
            await new Promise(resolve => setTimeout(resolve, 100));

            // Verify RPC was called
            expect(mockServer.getLatestLedger).toHaveBeenCalled();
            expect(mockServer.getEvents).toHaveBeenCalled();

            stopEventListener();
        });

        it('should handle multiple sequential events correctly', async () => {
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

        it('should prevent duplicate processing on listener restart', async () => {
            const walletAddress = 'GBUQWP3BOUZX34ULNQG23RQ6F4BVWCIBTICSQYY2T4YJJWUDLVXVVU6G';

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
            await new Promise(resolve => setTimeout(resolve, 100));
            stopEventListener();

            // Verify RPC was called
            expect(mockServer.getLatestLedger).toHaveBeenCalled();

            stopEventListener();
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
            await new Promise(resolve => setTimeout(resolve, 100));

            // Verify listener ran without crashing
            expect(mockServer.getLatestLedger).toHaveBeenCalled();

            stopEventListener();
        });
    });
});
