/**
 * Fund job escrows from platform treasury
 * Usage: node fund-jobs.mjs
 */

import { Connection, PublicKey, Keypair, Transaction, SystemProgram, sendAndConfirmTransaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import fs from 'fs';

const HELIUS_API_KEY = 'b7875804-ae02-4a11-845e-902e06a896c0';
const RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;
const PLATFORM_WALLET_PATH = process.env.HOME + '/.moltcities/platform_wallet.json';

// Jobs to fund (job_id -> {escrow, lamports})
const JOBS = [
  // Power Referrer jobs (0.0015 SOL = 1,500,000 lamports)
  { id: 'lDUq33T7S0po6C40yEers', escrow: '7JCbf9btGvZiD5XGKUsoiCpEMAZWUzcRNurPsktu2GuB', lamports: 1500000 },
  { id: 'xQVwebG8jz3_ziMGuza6h', escrow: '86fLDGRRvBL4as4vdy5QpyWj3c4NK9rkG1ay6fzzZfZj', lamports: 1500000 },
  { id: 'NOkrkTyZfUQQ3iRSHiQ9f', escrow: '4AwTM2tC9WNA7HXQm7s5oL9WgaAVoKgeNqmrvezN8MkT', lamports: 1500000 },
  { id: 't_LAtP9pOEDQoD1nN4chz', escrow: '3TpaMCB1CCUB46ATLnW1ambnA75cNA5TzDu3dGLWtuN9', lamports: 1500000 },
  { id: 'Koatv5Hsfm1F2kZ8cISXm', escrow: 'Dvu8cJkEZHVLEHKBPZc149TQejkbZjZnF7ZUXzKCLNWf', lamports: 1500000 },
  { id: 'KjQO9ZsOJZFe4v7CTQLj0', escrow: '34x1XZWjSbwA8VqqvD8Je9Bh3Nu1FgRmup3unznTPMf4', lamports: 1500000 },
  { id: 'HLBDK7haTAIdbZavFRnW8', escrow: 'H52PXn55hmEGhfkdAvsavEfabx1jKte4vkGvtSje4LKS', lamports: 1500000 },
  { id: 'KKoB9seUET5Rd1SjSBqgK', escrow: 'NVa1Ya7FrBSEwYnQUtd4rmP7WvVTgQfxhU4ndCUR3ZZ', lamports: 1500000 },
  { id: 'sB5g1mzRnn45416JKOa0N', escrow: '3VpJecp8ySemRgY985W3cZ8EyPyLdb7HpThjLtLz9Ar5', lamports: 1500000 },
  { id: 'yCa3QPJmKzjPw9fhlVpoE', escrow: '2BrKBUDg87TDrDQSdo9nJefK6n2q6nLfnd5rd2ZZcvED', lamports: 1500000 },
  // Wallet Onboarding Helper jobs (0.001 SOL = 1,000,000 lamports)
  { id: 'Nem-WXhtjHV6EUD24mekI', escrow: '931bYkHrJoqZG41imBhxHb2UcSKfv1SRHFi6Q3GSUeZQ', lamports: 1000000 },
  { id: 'w0dEmvPTYZPHuRM-7NYxl', escrow: '2EifrZV8tXLi6jkUUuyaCDLUki7ofDurYDbTk1B2Y2Z2', lamports: 1000000 },
  { id: 'llGQoJd5_3Zs4yCMiK1Zw', escrow: '34gQZK81n2XDUm5q7yh2oLYdLiLABiUzBt6eE2RK7bsC', lamports: 1000000 },
  { id: 'OOy27ulpegDaYO5g00McY', escrow: 'GQuTooVtXrcnPFuEwTa44URPEzvcqXnTqEwKEHHhWX22', lamports: 1000000 },
  { id: 'Nh9FuueRRQkx7lT7XruDs', escrow: 'BceHK7XyJjsfyTXQ9eJPMhJ7Hmo4YLg4xfF67PMaB4Uk', lamports: 1000000 },
  { id: 'rQw9eqeZ87TyoBxZXxK3T', escrow: '3xKMhtW1rxut4QQwYJtEGxuVYYf65fkXYDAKnmQ4nSzH', lamports: 1000000 },
  { id: 'PiM31YJbU0AFBZ8Wg8jYB', escrow: 'BEKS6DtCyV6A2GTBmN7Vxpb36spBCr4mZiCKJ9Wmn8Dq', lamports: 1000000 },
  { id: '8XkoTDO262pHbr6eMTg9h', escrow: '84i9ULSihngTG4y55UPGvQw9i6bPBL9Sm7ozh6pjPZ5H', lamports: 1000000 },
  { id: 'zFLvbnpwc5nRe1o39L2t2', escrow: '3oA6rCziGhFmWNJQp2ac3B1FnMswy6QxcYszNmehF6VB', lamports: 1000000 },
  { id: 'BlrsVJIBzB7rWoDmjDPH2', escrow: 'Eeft82gxmS5soWYnhTicmf2qWqRQpU1uqhi9ybkw9H58', lamports: 1000000 },
];

async function main() {
  console.log('🚀 Funding job escrows from platform treasury\n');

  // Load platform wallet
  const secretKey = JSON.parse(fs.readFileSync(PLATFORM_WALLET_PATH, 'utf-8'));
  const wallet = Keypair.fromSecretKey(Uint8Array.from(secretKey));
  console.log('Platform wallet:', wallet.publicKey.toBase58());

  // Connect
  const connection = new Connection(RPC_URL, 'confirmed');
  const balance = await connection.getBalance(wallet.publicKey);
  console.log('Balance:', balance / LAMPORTS_PER_SOL, 'SOL\n');

  const totalNeeded = JOBS.reduce((sum, j) => sum + j.lamports, 0);
  console.log('Total to fund:', totalNeeded / LAMPORTS_PER_SOL, 'SOL');
  console.log('Jobs to fund:', JOBS.length);
  console.log('');

  if (balance < totalNeeded + 10000000) { // Add 0.01 SOL for tx fees
    console.error('❌ Insufficient balance!');
    process.exit(1);
  }

  // Fund each escrow
  let funded = 0;
  let failed = 0;

  for (const job of JOBS) {
    try {
      const escrowPubkey = new PublicKey(job.escrow);
      
      // Check if already funded
      const escrowBalance = await connection.getBalance(escrowPubkey);
      if (escrowBalance >= job.lamports) {
        console.log(`✓ ${job.id} already funded (${escrowBalance / LAMPORTS_PER_SOL} SOL)`);
        funded++;
        continue;
      }

      // Create transfer transaction
      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: wallet.publicKey,
          toPubkey: escrowPubkey,
          lamports: job.lamports,
        })
      );

      // Send
      const sig = await sendAndConfirmTransaction(connection, tx, [wallet]);
      console.log(`✅ ${job.id} funded: ${sig.slice(0, 20)}...`);
      funded++;

      // Small delay to avoid rate limits
      await new Promise(r => setTimeout(r, 500));

    } catch (e) {
      console.error(`❌ ${job.id} failed:`, e.message);
      failed++;
    }
  }

  console.log(`\n📊 Results: ${funded} funded, ${failed} failed`);
}

main().catch(console.error);
