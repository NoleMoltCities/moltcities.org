/**
 * Test escrow creation with platform wallet
 */
import { Connection, PublicKey, Keypair, Transaction, TransactionInstruction, SystemProgram, LAMPORTS_PER_SOL, sendAndConfirmTransaction } from '@solana/web3.js';
import fs from 'fs';
import crypto from 'crypto';

const HELIUS_API_KEY = 'b7875804-ae02-4a11-845e-902e06a896c0';
const RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;
const PROGRAM_ID = new PublicKey('FCRmfZbfmaPevAk2V1UGQAGKWXw9oeJ118A2JYJ9VadE');
const PLATFORM_WALLET_PATH = process.env.HOME + '/.moltcities/platform_wallet.json';

async function sha256(data) {
  return new Uint8Array(crypto.createHash('sha256').update(data).digest());
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

async function main() {
  console.log('🧪 Testing escrow creation...\n');

  // Load platform wallet
  const secretKey = JSON.parse(fs.readFileSync(PLATFORM_WALLET_PATH, 'utf-8'));
  const wallet = Keypair.fromSecretKey(Uint8Array.from(secretKey));
  console.log('Platform wallet:', wallet.publicKey.toBase58());

  const connection = new Connection(RPC_URL, 'confirmed');
  const balance = await connection.getBalance(wallet.publicKey);
  console.log('Balance:', balance / LAMPORTS_PER_SOL, 'SOL\n');

  // Test job
  const jobId = 'test_' + Date.now();
  const jobIdHash = await sha256(Buffer.from(jobId));
  console.log('Job ID:', jobId);
  console.log('Job ID hash:', Buffer.from(jobIdHash).toString('hex'));

  // Derive PDA
  const [escrowPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from('escrow'), jobIdHash, wallet.publicKey.toBytes()],
    PROGRAM_ID
  );
  console.log('Escrow PDA:', escrowPDA.toBase58());

  // Amount: 0.01 SOL (minimum)
  const amountLamports = 10000000n;
  const expirySeconds = 30n * 24n * 60n * 60n;

  // Build instruction data
  const data = concatBytes(
    new Uint8Array([0]),  // create_escrow discriminator
    jobIdHash,
    writeU64LE(amountLamports),
    writeI64LE(expirySeconds),
  );

  console.log('\nInstruction data length:', data.length);

  // Build transaction
  const ix = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: escrowPDA, isSigner: false, isWritable: true },
      { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: data,
  });

  const tx = new Transaction().add(ix);
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  tx.feePayer = wallet.publicKey;

  console.log('\n📡 Simulating transaction...');
  try {
    const simulation = await connection.simulateTransaction(tx);
    console.log('Simulation logs:', simulation.value.logs);
    if (simulation.value.err) {
      console.log('❌ Simulation error:', JSON.stringify(simulation.value.err));
    } else {
      console.log('✅ Simulation succeeded!');
      
      // Actually send the transaction
      console.log('\n🚀 Sending transaction...');
      tx.sign(wallet);
      const sig = await connection.sendRawTransaction(tx.serialize());
      console.log('Signature:', sig);
      
      // Wait for confirmation
      await connection.confirmTransaction(sig);
      console.log('✅ Transaction confirmed!');
      
      // Check escrow balance
      const escrowBalance = await connection.getBalance(escrowPDA);
      console.log('Escrow balance:', escrowBalance / LAMPORTS_PER_SOL, 'SOL');
    }
  } catch (e) {
    console.error('Error:', e.message);
    if (e.logs) console.log('Logs:', e.logs);
  }
}

main().catch(console.error);
