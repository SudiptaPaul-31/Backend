import crypto from 'crypto'
import { createCustodialWallet, getWalletByUserId } from '../stellar/wallet'

export type WhatsAppUser = {
  id: string
  phone: string
  verified: boolean
  walletAddress: string
  balance: number
  otp?: {
    code: string
    expiresAt: number
  }
}

// In-memory user store (replace with DB in production)
const userStore = new Map<string, WhatsAppUser>()

const OTP_TTL_MS = 1000 * 60 * 5 // 5 minutes

/**
 * Normalize WhatsApp phone identifiers (e.g. whatsapp:+1234567890) into a stable key.
 */
export function normalizePhone(phone: string): string {
  return phone.replace(/^whatsapp:/i, '').trim()
}

export function getUserByPhone(phone: string): WhatsAppUser | null {
  const normalized = normalizePhone(phone)
  return userStore.get(normalized) ?? null
}

export async function createOrGetUser(phone: string): Promise<WhatsAppUser> {
  const normalized = normalizePhone(phone)
  const existing = userStore.get(normalized)
  if (existing) {
    return existing
  }

  const userId = crypto.randomUUID()
  const wallet = await createCustodialWallet(userId)

  const newUser: WhatsAppUser = {
    id: userId,
    phone: normalized,
    verified: false,
    walletAddress: wallet.publicKey,
    balance: 0,
  }

  userStore.set(normalized, newUser)
  return newUser
}

export function generateOtp(phone: string): string {
  const user = getUserByPhone(phone)
  if (!user) {
    throw new Error('User not found')
  }

  const code = (Math.floor(100000 + Math.random() * 900000)).toString()
  user.otp = {
    code,
    expiresAt: Date.now() + OTP_TTL_MS,
  }

  // Update store for reference
  userStore.set(user.phone, user)

  return code
}

export function verifyOtp(phone: string, code: string): boolean {
  const user = getUserByPhone(phone)
  if (!user || !user.otp) {
    return false
  }

  const now = Date.now()
  if (now > user.otp.expiresAt) {
    delete user.otp
    userStore.set(user.phone, user)
    return false
  }

  if (user.otp.code !== code) {
    return false
  }

  user.verified = true
  delete user.otp
  userStore.set(user.phone, user)
  return true
}

export function getUserWalletAddress(phone: string): string | null {
  const user = getUserByPhone(phone)
  if (!user) return null
  return user.walletAddress
}

export function getBalance(phone: string): number | null {
  const user = getUserByPhone(phone)
  return user ? user.balance : null
}

export function incrementBalance(phone: string, amount: number): number {
  const user = getUserByPhone(phone)
  if (!user) {
    throw new Error('User not found')
  }
  user.balance = Math.max(0, user.balance + amount)
  userStore.set(user.phone, user)
  return user.balance
}

export function decrementBalance(phone: string, amount: number): number {
  const user = getUserByPhone(phone)
  if (!user) {
    throw new Error('User not found')
  }
  user.balance = Math.max(0, user.balance - amount)
  userStore.set(user.phone, user)
  return user.balance
}

export function getUserForTests(phone: string): WhatsAppUser | null {
  return getUserByPhone(phone)
}

export function clearUsersForTests(): void {
  userStore.clear()
}

export async function ensureWalletDecrypted(phone: string) {
  const user = getUserByPhone(phone)
  if (!user) throw new Error('User not found')

  // Read from wallet store to ensure decryption works.
  // This is used in tests to ensure secret keys are not stored in plaintext.
  await getWalletByUserId(user.id)
}
