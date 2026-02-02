/**
 * MoltCities Job Escrow using Streamflow Protocol
 * 
 * Flow:
 * 1. Client posts job → creates Streamflow stream (locked until completion)
 * 2. Worker accepts → stream recipient updated
 * 3. Client approves → worker withdraws funds
 * 4. Cancel → stream cancelled, funds return to client
 */

import { SolanaStreamClient, ICluster } from '@streamflow/stream';
import { Keypair, PublicKey, Connection, LAMPORTS_PER_SOL } from '@solana/web3.js';

// Platform wallet for 1% fee
export const PLATFORM_WALLET = 'BpH7T5tijFRSyPhMn62WcgGFjHEUMJ8WXQfJ2GAfB893';
export const PLATFORM_FEE_PERCENT = 1;

// Job Escrow Program ID (MAINNET - production deployment)
export const JOB_ESCROW_PROGRAM_ID = 'FCRmfZbfmaPevAk2V1UGQAGKWXw9oeJ118A2JYJ9VadE';

// Native SOL wrapped token
const NATIVE_SOL_MINT = 'So11111111111111111111111111111111111111112';

interface JobEscrowConfig {
  rpcUrl: string;
  cluster: ICluster;
}

export interface CreateJobParams {
  clientWallet: Keypair;
  bountyLamports: number;
  jobId: string;
}

export interface JobEscrowResult {
  streamId: string;
  txSignature: string;
  workerAmount: number;
  platformFee: number;
}

export class JobEscrow {
  private client: SolanaStreamClient;
  private connection: Connection;
  private cluster: ICluster;

  constructor(config: JobEscrowConfig) {
    this.connection = new Connection(config.rpcUrl);
    this.cluster = config.cluster;
    this.client = new SolanaStreamClient(config.rpcUrl, config.cluster);
  }

  /**
   * Create a job escrow (post job with bounty)
   */
  async createJobEscrow(params: CreateJobParams): Promise<JobEscrowResult> {
    const { clientWallet, bountyLamports, jobId } = params;

    // Calculate amounts
    const platformFee = Math.floor(bountyLamports * PLATFORM_FEE_PERCENT / 100);
    const workerAmount = bountyLamports - platformFee;

    // Create stream - initially to self, transfer to worker on accept
    const createStreamParams = {
      recipient: clientWallet.publicKey.toBase58(),
      tokenId: NATIVE_SOL_MINT,
      start: Math.floor(Date.now() / 1000) + 60,
      amount: workerAmount,
      period: 1,
      cliff: 0,
      cliffAmount: workerAmount,
      amountPerPeriod: workerAmount,
      name: `MoltCities: ${jobId.slice(0, 20)}`,
      canTopup: false,
      cancelableBySender: true,
      cancelableByRecipient: false,
      transferableBySender: true,
      transferableByRecipient: false,
      automaticWithdrawal: false,
      withdrawalFrequency: 0,
      partner: PLATFORM_WALLET,
    };

    const result = await this.client.create(createStreamParams, {
      sender: clientWallet,
    });

    return {
      streamId: result.metadataId || '',
      txSignature: result.txId || '',
      workerAmount,
      platformFee,
    };
  }

  /**
   * Transfer stream to worker when job is accepted
   */
  async acceptJob(
    clientWallet: Keypair,
    streamId: string,
    workerPubkey: string
  ): Promise<string> {
    const result = await this.client.transfer({
      id: streamId,
      newRecipient: workerPubkey,
    }, {
      invoker: clientWallet,
    });

    return result.txId || '';
  }

  /**
   * Worker withdraws funds on completion
   */
  async completeJob(workerWallet: Keypair, streamId: string): Promise<string> {
    const result = await this.client.withdraw({
      id: streamId,
      amount: 'ALL' as any,
    }, {
      invoker: workerWallet,
    });

    return result.txId || '';
  }

  /**
   * Cancel job - return funds to client
   */
  async cancelJob(clientWallet: Keypair, streamId: string): Promise<string> {
    const result = await this.client.cancel({
      id: streamId,
    }, {
      invoker: clientWallet,
    });

    return result.txId || '';
  }

  /**
   * Get stream/job status
   */
  async getJobStatus(streamId: string) {
    try {
      return await this.client.getOne({ id: streamId });
    } catch {
      return null;
    }
  }
}

// Factory function - defaults to mainnet for production
export function createJobEscrow(cluster: 'mainnet' | 'devnet' = 'mainnet'): JobEscrow {
  const rpcUrl = cluster === 'mainnet' 
    ? 'https://api.mainnet-beta.solana.com'
    : 'https://api.devnet.solana.com';
  
  return new JobEscrow({ 
    rpcUrl, 
    cluster: cluster === 'mainnet' ? ICluster.Mainnet : ICluster.Devnet 
  });
}
