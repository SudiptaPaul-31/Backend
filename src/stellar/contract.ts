import {
  Contract,
  rpc,
  TransactionBuilder,
  Operation,
  BASE_FEE,
  xdr,
  scValToNative,
  nativeToScVal,
  Address,
} from '@stellar/stellar-sdk';
import { getRpcServer, getNetworkPassphrase, getAgentKeypair, submitTransaction, waitForConfirmation } from './client';
import { OnChainBalance, TransactionResult } from './types';

const VAULT_CONTRACT_ID = process.env.VAULT_CONTRACT_ID || '';

/**
 * Get vault contract instance
 */
function getVaultContract(): Contract {
  if (!VAULT_CONTRACT_ID) {
    throw new Error('VAULT_CONTRACT_ID not configured');
  }
  return new Contract(VAULT_CONTRACT_ID);
}

/**
 * Build contract invocation transaction
 */
async function buildContractCall(method: string, args: xdr.ScVal[]): Promise<any> {
  const server = getRpcServer();
  const contract = getVaultContract();
  const keypair = getAgentKeypair();
  
  const account = await server.getAccount(keypair.publicKey());
  
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: getNetworkPassphrase(),
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(30)
    .build();
  
  return tx;
}

/**
 * Simulate and parse contract read call
 */
async function simulateRead(method: string, args: xdr.ScVal[] = []): Promise<any> {
  const server = getRpcServer();
  const tx = await buildContractCall(method, args);
  
  const simulation = await server.simulateTransaction(tx);
  
  if (rpc.Api.isSimulationError(simulation)) {
    throw new Error(`Simulation failed: ${simulation.error}`);
  }
  
  if (!simulation.result) {
    throw new Error('No result from simulation');
  }
  
  return scValToNative(simulation.result.retval);
}

/**
 * Get on-chain balance for user
 */
export async function getOnChainBalance(userAddress: string): Promise<OnChainBalance> {
  const addressScVal = nativeToScVal(userAddress, { type: 'address' });
  const result = await simulateRead('get_balance', [addressScVal]);
  
  return {
    balance: result.balance?.toString() || '0',
    shares: result.shares?.toString() || '0',
  };
}

/**
 * Get current APY from vault
 */
export async function getOnChainAPY(): Promise<number> {
  const apyBasisPoints = await simulateRead('get_apy');
  return apyBasisPoints / 100; // Convert basis points to percentage
}

/**
 * Get active protocol
 */
export async function getActiveProtocol(): Promise<string> {
  return await simulateRead('get_active_protocol');
}

/**
 * Trigger rebalance (agent only)
 */
export async function triggerRebalance(
  protocol: string,
  expectedApyBasisPoints: number
): Promise<TransactionResult> {
  const protocolScVal = nativeToScVal(protocol, { type: 'string' });
  const apyScVal = nativeToScVal(expectedApyBasisPoints, { type: 'u32' });
  
  const tx = await buildContractCall('rebalance', [protocolScVal, apyScVal]);
  
  const server = getRpcServer();
  const keypair = getAgentKeypair();
  
  // Prepare transaction
  const prepared = await server.prepareTransaction(tx);
  prepared.sign(keypair);
  
  const txHash = await submitTransaction(prepared);
  return await waitForConfirmation(txHash);
}

/**
 * Update total assets (agent only)
 */
export async function updateTotalAssets(newTotalStroops: string): Promise<TransactionResult> {
  const amountScVal = nativeToScVal(BigInt(newTotalStroops), { type: 'i128' });
  
  const tx = await buildContractCall('update_total_assets', [amountScVal]);
  
  const server = getRpcServer();
  const keypair = getAgentKeypair();
  
  const prepared = await server.prepareTransaction(tx);
  prepared.sign(keypair);
  
  const txHash = await submitTransaction(prepared);
  return await waitForConfirmation(txHash);
}
