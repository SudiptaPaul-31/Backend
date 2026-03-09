/**
 * Unit tests for src/whatsapp/userManager.ts
 * Mocks the Stellar wallet so no real keys are generated.
 */

jest.mock('../../../src/stellar/wallet', () => ({
  createCustodialWallet: jest.fn().mockResolvedValue({ publicKey: 'GMOCKPUBKEY' }),
  getWalletByUserId: jest.fn().mockResolvedValue({ publicKey: 'GMOCKPUBKEY', secretKey: 'SMOCKSECRET' }),
}));

import {
  normalizePhone,
  createOrGetUser,
  generateOtp,
  verifyOtp,
  getUserWalletAddress,
  getBalance,
  incrementBalance,
  decrementBalance,
  getUserForTests,
  clearUsersForTests,
  ensureWalletDecrypted,
} from '../../../src/whatsapp/userManager';

describe('WhatsApp UserManager', () => {
  beforeEach(() => {
    clearUsersForTests();
  });

  // ── normalizePhone ────────────────────────────────────────────────────────

  describe('normalizePhone()', () => {
    it('strips whatsapp: prefix', () => {
      expect(normalizePhone('whatsapp:+1234567890')).toBe('+1234567890');
    });

    it('is case-insensitive for the prefix', () => {
      expect(normalizePhone('WhatsApp:+1234567890')).toBe('+1234567890');
    });

    it('leaves a plain phone number unchanged', () => {
      expect(normalizePhone('+1234567890')).toBe('+1234567890');
    });
  });

  // ── createOrGetUser ───────────────────────────────────────────────────────

  describe('createOrGetUser()', () => {
    it('creates a new user with walletAddress and verified=false', async () => {
      const user = await createOrGetUser('+1111111111');
      expect(user.phone).toBe('+1111111111');
      expect(user.verified).toBe(false);
      expect(user.walletAddress).toBe('GMOCKPUBKEY');
      expect(user.balance).toBe(0);
    });

    it('returns the same user on subsequent calls', async () => {
      const u1 = await createOrGetUser('+2222222222');
      const u2 = await createOrGetUser('+2222222222');
      expect(u1.id).toBe(u2.id);
    });
  });

  // ── generateOtp / verifyOtp ───────────────────────────────────────────────

  describe('generateOtp() and verifyOtp()', () => {
    const PHONE = '+3333333333';

    beforeEach(async () => {
      await createOrGetUser(PHONE);
    });

    it('generates a 6-digit code', () => {
      const code = generateOtp(PHONE);
      expect(code).toMatch(/^\d{6}$/);
    });

    it('throws when phone has no user', () => {
      expect(() => generateOtp('+0000000000')).toThrow('User not found');
    });

    it('verifyOtp returns true for the correct code', () => {
      const code = generateOtp(PHONE);
      expect(verifyOtp(PHONE, code)).toBe(true);
    });

    it('marks user as verified after successful OTP', () => {
      const code = generateOtp(PHONE);
      verifyOtp(PHONE, code);
      expect(getUserForTests(PHONE)?.verified).toBe(true);
    });

    it('verifyOtp returns false for an incorrect code', () => {
      generateOtp(PHONE);
      expect(verifyOtp(PHONE, '000000')).toBe(false);
    });

    it('verifyOtp returns false for unknown phone', () => {
      expect(verifyOtp('+9999999999', '123456')).toBe(false);
    });

    it('verifyOtp returns false when OTP has expired', () => {
      const user = getUserForTests(PHONE)!;
      generateOtp(PHONE);
      // Force expiry
      user.otp!.expiresAt = Date.now() - 1_000;
      expect(verifyOtp(PHONE, user.otp!.code)).toBe(false);
    });
  });

  // ── getBalance / incrementBalance / decrementBalance ──────────────────────

  describe('balance operations', () => {
    const PHONE = '+4444444444';

    beforeEach(async () => {
      await createOrGetUser(PHONE);
    });

    it('getBalance returns 0 for a new user', () => {
      expect(getBalance(PHONE)).toBe(0);
    });

    it('getBalance returns null for unknown user', () => {
      expect(getBalance('+0000000001')).toBeNull();
    });

    it('incrementBalance increases the balance', () => {
      const newBal = incrementBalance(PHONE, 100);
      expect(newBal).toBe(100);
      expect(getBalance(PHONE)).toBe(100);
    });

    it('incrementBalance throws for unknown user', () => {
      expect(() => incrementBalance('+0000000002', 10)).toThrow('User not found');
    });

    it('decrementBalance decreases the balance', () => {
      incrementBalance(PHONE, 50);
      const newBal = decrementBalance(PHONE, 20);
      expect(newBal).toBe(30);
    });

    it('decrementBalance clamps to zero (never negative)', () => {
      const newBal = decrementBalance(PHONE, 9999);
      expect(newBal).toBe(0);
    });
  });

  // ── getUserWalletAddress ──────────────────────────────────────────────────

  describe('getUserWalletAddress()', () => {
    it('returns wallet address for a known user', async () => {
      await createOrGetUser('+5555555555');
      expect(getUserWalletAddress('+5555555555')).toBe('GMOCKPUBKEY');
    });

    it('returns null for an unknown user', () => {
      expect(getUserWalletAddress('+0000000003')).toBeNull();
    });
  });

  // ── ensureWalletDecrypted ─────────────────────────────────────────────────

  describe('ensureWalletDecrypted()', () => {
    it('resolves without error for a known user', async () => {
      await createOrGetUser('+6666666666');
      await expect(ensureWalletDecrypted('+6666666666')).resolves.not.toThrow();
    });

    it('throws for an unknown user', async () => {
      await expect(ensureWalletDecrypted('+0000000004')).rejects.toThrow('User not found');
    });
  });
});
