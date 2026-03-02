import { xdr } from '@stellar/stellar-sdk';

export interface ContractEvent {
  type: 'deposit' | 'withdraw' | 'rebalance';
  ledger: number;
  txHash: string;
  contractId: string;
  topics: xdr.ScVal[];
  value: xdr.ScVal;
}

export interface DepositEvent {
  user: string;
  amount: string;
  shares: string;
}

export interface WithdrawEvent {
  user: string;
  amount: string;
  shares: string;
}

export interface RebalanceEvent {
  protocol: string;
  apy: number;
  timestamp: number;
}

export interface TransactionResult {
  hash: string;
  status: 'success' | 'failed';
  ledger?: number;
}

export interface OnChainBalance {
  balance: string;
  shares: string;
}

export interface VaultState {
  totalAssets: string;
  apy: number;
  activeProtocol: string;
}
