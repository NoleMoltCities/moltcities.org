/**
 * Quick test for Streamflow integration
 */

import { SolanaStreamClient } from '@streamflow/stream';
import { Keypair, Connection, LAMPORTS_PER_SOL } from '@solana/web3.js';
import fs from 'fs';

const PLATFORM_WALLET = 'BpH7T5tijFRSyPhMn62WcgGFjHEUMJ8WXQfJ2GAfB893';

async function main() {
  console.log('🚀 MoltCities Job Escrow Test (Devnet)\n');

  // Load wallet
  const walletPath = process.env.HOME + '/.moltcities/nole_solana_wallet.json';
  const secretKey = JSON.parse(fs.readFileSync(walletPath, 'utf-8'));
  const wallet = Keypair.fromSecretKey(Uint8Array.from(secretKey));
  
  console.log('Wallet:', wallet.publicKey.toBase58());

  // Check balance
  const connection = new Connection('https://api.devnet.solana.com');
  const balance = await connection.getBalance(wallet.publicKey);
  console.log('Balance:', balance / LAMPORTS_PER_SOL, 'SOL');

  // Create Streamflow client
  const client = new SolanaStreamClient(
    'https://api.devnet.solana.com',
    'devnet'
  );

  console.log('\n✅ Streamflow client initialized');
  console.log('Platform wallet:', PLATFORM_WALLET);
  console.log('\nIntegration ready for job escrow!');
}

main().catch(console.error);
