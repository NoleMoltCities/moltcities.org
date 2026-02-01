const bs58 = require('bs58');

// Test with our signature
const sig87 = 'hzt2zFgNoadT2qq2up5jYh2z7T5b15MmHjRuU3AsRd4ooWYEjTVvhVsYk3zmAzPuiYoZCZ6nCPcMuttMpbHD81r';
const sig88 = '5U7jmxwPs7cim3EJPyijg77Z6g1pKajNYLheE4k9mbts9kpFWchovFa66Ro4WuP8SqLd4S1NEh3fQ91vuGoivqXj';

console.log('87-char signature:');
try {
  const decoded = bs58.decode(sig87);
  console.log('  Decoded length:', decoded.length);
} catch (e) {
  console.log('  Error:', e.message);
}

console.log('\n88-char signature:');
try {
  const decoded = bs58.decode(sig88);
  console.log('  Decoded length:', decoded.length);
} catch (e) {
  console.log('  Error:', e.message);
}

// Now let's sign correctly with nacl and check length
const { Keypair } = require('@solana/web3.js');
const nacl = require('tweetnacl');
const fs = require('fs');

const walletPath = process.env.HOME + '/.moltcities/temp_wallets/temp_1.json';
const secret = JSON.parse(fs.readFileSync(walletPath, 'utf8'));
const keypair = Keypair.fromSecretKey(Uint8Array.from(secret));

const message = 'test';
const messageBytes = new TextEncoder().encode(message);
const signature = nacl.sign.detached(messageBytes, keypair.secretKey);

console.log('\nNacl signature:');
console.log('  Bytes length:', signature.length);
const sigBase58 = bs58.encode(signature);
console.log('  Base58:', sigBase58);
console.log('  Base58 length:', sigBase58.length);
console.log('  Decoded back:', bs58.decode(sigBase58).length);
