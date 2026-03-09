import { responses } from '../../../src/nlp/responses';

describe('NLP Responses', () => {
  describe('deposit()', () => {
    it('returns message with amount only', () => {
      expect(responses.deposit(100)).toBe('You want to deposit 100.');
    });

    it('returns message with amount and currency', () => {
      expect(responses.deposit(100, 'USDC')).toBe('You want to deposit 100 USDC.');
    });
  });

  describe('withdraw()', () => {
    it('returns withdraw-all message when all=true', () => {
      expect(responses.withdraw(undefined, undefined, true)).toBe('You want to withdraw everything.');
    });

    it('returns message with amount', () => {
      expect(responses.withdraw(50)).toBe('You want to withdraw 50.');
    });

    it('returns message with amount and currency', () => {
      expect(responses.withdraw(50, 'XLM')).toBe('You want to withdraw 50 XLM.');
    });
  });

  describe('balance()', () => {
    it('returns the balance message', () => {
      expect(responses.balance()).toBe('Here is your current balance.');
    });
  });

  describe('help()', () => {
    it('returns a message containing deposit and withdraw hints', () => {
      const msg = responses.help();
      expect(msg).toContain('deposit');
      expect(msg).toContain('withdraw');
    });
  });

  describe('unrecognized()', () => {
    it('returns an apology message', () => {
      expect(responses.unrecognized()).toContain("couldn't understand");
    });
  });
});
