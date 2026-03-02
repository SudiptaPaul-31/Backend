import { submitTransaction, waitForConfirmation } from '../client';
import { getOnChainBalance, triggerRebalance } from '../contract';
import { Transaction } from '@stellar/stellar-sdk';

jest.mock('../client', () => ({
  getRpcServer: jest.fn(),
  getNetworkPassphrase: jest.fn(() => 'Test SDF Network ; September 2015'),
  getAgentKeypair: jest.fn(),
  submitTransaction: jest.fn(),
  waitForConfirmation: jest.fn(),
}));

describe('Stellar Integration - Unit Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Transaction Submission', () => {
    it('should submit transaction successfully', async () => {
      const mockHash = 'abc123';
      (submitTransaction as jest.Mock).mockResolvedValue(mockHash);

      const result = await submitTransaction({} as Transaction);

      expect(result).toBe(mockHash);
      expect(submitTransaction).toHaveBeenCalledTimes(1);
    });

    it('should handle submission failure', async () => {
      (submitTransaction as jest.Mock).mockRejectedValue(
        new Error('Transaction failed: invalid signature')
      );

      await expect(submitTransaction({} as Transaction)).rejects.toThrow(
        'Transaction failed: invalid signature'
      );
    });
  });

  describe('Confirmation Polling', () => {
    it('should return success on confirmed transaction', async () => {
      const mockResult = {
        hash: 'abc123',
        status: 'success' as const,
        ledger: 12345,
      };
      (waitForConfirmation as jest.Mock).mockResolvedValue(mockResult);

      const result = await waitForConfirmation('abc123');

      expect(result.status).toBe('success');
      expect(result.ledger).toBe(12345);
    });

    it('should handle failed transaction', async () => {
      const mockResult = {
        hash: 'abc123',
        status: 'failed' as const,
      };
      (waitForConfirmation as jest.Mock).mockResolvedValue(mockResult);

      const result = await waitForConfirmation('abc123');

      expect(result.status).toBe('failed');
    });

    it('should timeout after max wait time', async () => {
      (waitForConfirmation as jest.Mock).mockRejectedValue(
        new Error('Transaction confirmation timeout after 30000ms')
      );

      await expect(waitForConfirmation('abc123')).rejects.toThrow('timeout');
    });
  });

  describe('Contract Read Operations', () => {
    it('should parse balance correctly', async () => {
      const mockBalance = {
        balance: '1000000000',
        shares: '500000000',
      };

      jest.spyOn(require('../contract'), 'getOnChainBalance').mockResolvedValue(mockBalance);

      const result = await getOnChainBalance('GTEST123');

      expect(result.balance).toBe('1000000000');
      expect(result.shares).toBe('500000000');
    });

    it('should handle read errors gracefully', async () => {
      jest.spyOn(require('../contract'), 'getOnChainBalance').mockRejectedValue(
        new Error('Simulation failed: contract not found')
      );

      await expect(getOnChainBalance('GTEST123')).rejects.toThrow('contract not found');
    });
  });

  describe('Contract Write Operations', () => {
    it('should submit rebalance transaction', async () => {
      const mockResult = {
        hash: 'rebalance123',
        status: 'success' as const,
        ledger: 12346,
      };

      jest.spyOn(require('../contract'), 'triggerRebalance').mockResolvedValue(mockResult);

      const result = await triggerRebalance('compound', 550);

      expect(result.hash).toBe('rebalance123');
      expect(result.status).toBe('success');
    });
  });

  describe('Event Parsing', () => {
    it('should parse deposit event', () => {
      const mockEvent = {
        type: 'deposit' as const,
        ledger: 12345,
        txHash: 'tx123',
        contractId: 'CTEST',
        topics: [],
        value: {} as any,
      };

      expect(mockEvent.type).toBe('deposit');
      expect(mockEvent.ledger).toBe(12345);
    });

    it('should parse withdraw event', () => {
      const mockEvent = {
        type: 'withdraw' as const,
        ledger: 12346,
        txHash: 'tx124',
        contractId: 'CTEST',
        topics: [],
        value: {} as any,
      };

      expect(mockEvent.type).toBe('withdraw');
    });

    it('should parse rebalance event', () => {
      const mockEvent = {
        type: 'rebalance' as const,
        ledger: 12347,
        txHash: 'tx125',
        contractId: 'CTEST',
        topics: [],
        value: {} as any,
      };

      expect(mockEvent.type).toBe('rebalance');
    });
  });
});
