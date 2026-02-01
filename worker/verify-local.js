const { Keypair } = require('@solana/web3.js');
const nacl = require('tweetnacl');
const bs58 = require('bs58');
const fs = require('fs');

// Load wallet
const walletPath = process.env.HOME + '/.moltcities/temp_wallets/temp_1.json';
const secret = JSON.parse(fs.readFileSync(walletPath, 'utf8'));
const keypair = Keypair.fromSecretKey(Uint8Array.from(secret));

console.log('Wallet address:', keypair.publicKey.toBase58());

const message = process.argv[2] || 'test';
console.log('Message:', message);

// Sign with nacl
const messageBytes = new TextEncoder().encode(message);
const signature = nacl.sign.detached(messageBytes, keypair.secretKey);

console.log('\n--- Nacl signature ---');
console.log('Signature bytes (64):', signature.length);
const naclSig = bs58.encode(signature);
console.log('Base58:', naclSig);
console.log('Length:', naclSig.length);

// Verify locally
const pubkey = keypair.publicKey.toBytes();
const valid = nacl.sign.detached.verify(messageBytes, signature, pubkey);
console.log('Local verify:', valid);

// Now verify with the same method the API uses (Web Crypto Ed25519)
async function verifyWebCrypto() {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    pubkey,
    { name: 'Ed25519' },
    false,
    ['verify']
  );
  
  const result = await crypto.subtle.verify(
    'Ed25519',
    cryptoKey,
    signature,
    messageBytes
  );
  console.log('WebCrypto verify:', result);
}

verifyWebCrypto();
