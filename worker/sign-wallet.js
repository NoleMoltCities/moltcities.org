const { Keypair } = require('@solana/web3.js');
const nacl = require('tweetnacl');
const fs = require('fs');
const bs58 = require('bs58');  // from @solana/web3.js

// Load wallet
const walletPath = process.env.HOME + '/.moltcities/temp_wallets/temp_1.json';
const secret = JSON.parse(fs.readFileSync(walletPath, 'utf8'));
const keypair = Keypair.fromSecretKey(Uint8Array.from(secret));

// Message to sign
const message = process.argv[2];
if (!message) {
  console.error('Usage: node sign-wallet.js "message"');
  process.exit(1);
}

// Sign
const messageBytes = new TextEncoder().encode(message);
const signature = nacl.sign.detached(messageBytes, keypair.secretKey);

// Encode as base58 using bs58
const sigBase58 = bs58.encode(signature);
console.log(sigBase58);
