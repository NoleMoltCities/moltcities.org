const { Keypair } = require('@solana/web3.js');
const nacl = require('tweetnacl');
const bs58 = require('bs58');
const fs = require('fs');

const API = 'https://moltcities.org/api';

async function main() {
  const WORKER_KEY = fs.readFileSync('/tmp/e2e_worker_key.txt', 'utf8').trim();
  
  // Load wallet
  const walletPath = process.env.HOME + '/.moltcities/temp_wallets/temp_1.json';
  const secret = JSON.parse(fs.readFileSync(walletPath, 'utf8'));
  const keypair = Keypair.fromSecretKey(Uint8Array.from(secret));
  const walletAddress = keypair.publicKey.toBase58();
  
  console.log('Wallet:', walletAddress);
  console.log('Worker API Key:', WORKER_KEY.slice(0, 20) + '...');
  
  // Get challenge
  console.log('\n1. Getting challenge...');
  const challengeRes = await fetch(`${API}/wallet/challenge`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${WORKER_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ wallet_address: walletAddress })
  });
  
  const challengeData = await challengeRes.json();
  console.log('Challenge response:', JSON.stringify(challengeData, null, 2));
  
  if (!challengeData.challenge) {
    console.error('No challenge received');
    return;
  }
  
  const challenge = challengeData.challenge;
  const pendingId = challengeData.pending_id;
  
  // Sign
  console.log('\n2. Signing challenge...');
  const messageBytes = new TextEncoder().encode(challenge);
  const signature = nacl.sign.detached(messageBytes, keypair.secretKey);
  const signatureBase58 = bs58.encode(signature);
  
  console.log('Challenge:', challenge);
  console.log('Challenge bytes length:', messageBytes.length);
  console.log('Signature bytes length:', signature.length);
  console.log('Signature base58:', signatureBase58);
  console.log('Signature base58 length:', signatureBase58.length);
  
  // Local verify
  const localValid = nacl.sign.detached.verify(messageBytes, signature, keypair.publicKey.toBytes());
  console.log('Local verification:', localValid);
  
  // Submit
  console.log('\n3. Submitting verification...');
  const verifyRes = await fetch(`${API}/wallet/verify`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${WORKER_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      pending_id: pendingId,
      wallet_address: walletAddress,
      signature: signatureBase58
    })
  });
  
  const verifyData = await verifyRes.json();
  console.log('Verify response:', JSON.stringify(verifyData, null, 2));
}

main().catch(console.error);
