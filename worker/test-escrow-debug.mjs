import { Connection, PublicKey, Keypair, Transaction, TransactionInstruction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import fs from 'fs';
import crypto from 'crypto';

const HELIUS_API_KEY = 'b7875804-ae02-4a11-845e-902e06a896c0';
const RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;
const PROGRAM_ID = new PublicKey('FCRmfZbfmaPevAk2V1UGQAGKWXw9oeJ118A2JYJ9VadE');
const PLATFORM_WALLET_PATH = process.env.HOME + '/.moltcities/platform_wallet.json';

async function sha256(data) {
  return new Uint8Array(crypto.createHash('sha256').update(data).digest());
}

function writeU64LE(value) {
  const arr = new Uint8Array(8);
  const view = new DataView(arr.buffer);
  view.setBigUint64(0, BigInt(value), true);
  return arr;
}

function writeI64LE(value) {
  const arr = new Uint8Array(8);
  const view = new DataView(arr.buffer);
  view.setBigInt64(0, BigInt(value), true);
  return arr;
}

function concatBytes(...arrays) {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

async function main() {
  const secretKey = JSON.parse(fs.readFileSync(PLATFORM_WALLET_PATH, 'utf-8'));
  const wallet = Keypair.fromSecretKey(Uint8Array.from(secretKey));
  console.log('Platform wallet:', wallet.publicKey.toBase58());

  const connection = new Connection(RPC_URL, 'confirmed');
  const balance = await connection.getBalance(wallet.publicKey);
  console.log('Balance:', balance / LAMPORTS_PER_SOL, 'SOL');

  // Test job ID
  const jobId = 'test_job_' + Date.now();
  console.log('Job ID:', jobId);
  
  // Compute hash
  const jobIdHash = await sha256(Buffer.from(jobId));
  console.log('Job ID hash:', Buffer.from(jobIdHash).toString('hex'));
  
  // Derive PDA
  const escrowSeeds = [
    Buffer.from('escrow'),
    jobIdHash,
    wallet.publicKey.toBytes(),
  ];
  const [escrowPDA, bump] = PublicKey.findProgramAddressSync(escrowSeeds, PROGRAM_ID);
  console.log('Escrow PDA:', escrowPDA.toBase58(), 'bump:', bump);
  
  // Check if PDA already has balance
  const pdaBalance = await connection.getBalance(escrowPDA);
  console.log('PDA balance:', pdaBalance / LAMPORTS_PER_SOL, 'SOL');
  
  // Build instruction data
  const amountLamports = 1500000n; // 0.0015 SOL
  const expirySeconds = 30n * 24n * 60n * 60n; // 30 days
  
  const data = concatBytes(
    new Uint8Array([0]),  // create_escrow discriminator
    jobIdHash,            // 32 bytes
    writeU64LE(amountLamports), // 8 bytes
    writeI64LE(expirySeconds),  // 8 bytes
  );
  
  console.log('Instruction data length:', data.length, 'bytes');
  console.log('Instruction data hex:', Buffer.from(data).toString('hex').slice(0, 100) + '...');
  
  // Build instruction
  const ix = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: escrowPDA, isSigner: false, isWritable: true },
      { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: data,
  });

  // Build transaction
  const tx = new Transaction().add(ix);
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  tx.feePayer = wallet.publicKey;
  tx.sign(wallet);

  // Simulate
  try {
    const simulation = await connection.simulateTransaction(tx);
    console.log('Simulation result:', JSON.stringify(simulation, null, 2));
  } catch (e) {
    console.error('Simulation error:', e.message);
  }
}

main().catch(console.error);
