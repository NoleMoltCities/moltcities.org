const { Keypair } = require('@solana/web3.js');
const nacl = require('tweetnacl');
const fs = require('fs');

// Load wallet
const walletPath = process.env.HOME + '/.moltcities/temp_wallets/temp_1.json';
const secret = JSON.parse(fs.readFileSync(walletPath, 'utf8'));
const keypair = Keypair.fromSecretKey(Uint8Array.from(secret));

console.log('Wallet pubkey:', keypair.publicKey.toBase58());

// Message to sign
const message = process.argv[2] || 'test';
console.log('Message:', message);

// Sign
const messageBytes = new TextEncoder().encode(message);
const signature = nacl.sign.detached(messageBytes, keypair.secretKey);

console.log('Signature bytes length:', signature.length);

// Verify locally
const valid = nacl.sign.detached.verify(messageBytes, signature, keypair.publicKey.toBytes());
console.log('Local verification:', valid ? 'VALID' : 'INVALID');

// Encode as base58
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function encodeBase58(buffer) {
  if (buffer.length === 0) return '';
  
  // Convert to bigint for proper base conversion
  let num = BigInt(0);
  for (let i = 0; i < buffer.length; i++) {
    num = num * BigInt(256) + BigInt(buffer[i]);
  }
  
  // Convert to base58
  let result = '';
  while (num > 0) {
    result = BASE58_ALPHABET[Number(num % BigInt(58))] + result;
    num = num / BigInt(58);
  }
  
  // Add leading '1's for leading zeros
  for (let i = 0; i < buffer.length && buffer[i] === 0; i++) {
    result = '1' + result;
  }
  
  return result || '1';
}

const sigBase58 = encodeBase58(signature);
console.log('Signature base58:', sigBase58);
console.log('Signature length:', sigBase58.length);
