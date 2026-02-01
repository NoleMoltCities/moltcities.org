const { Keypair } = require('@solana/web3.js');
const nacl = require('tweetnacl');
const fs = require('fs');
const bs58 = require('bs58');

// Load wallet
const walletPath = process.env.HOME + '/.moltcities/temp_wallets/temp_1.json';
const secret = JSON.parse(fs.readFileSync(walletPath, 'utf8'));
const keypair = Keypair.fromSecretKey(Uint8Array.from(secret));

const message = process.argv[2] || 'test';
const messageBytes = new TextEncoder().encode(message);
const signature = nacl.sign.detached(messageBytes, keypair.secretKey);

console.log('Message:', message);
console.log('Message bytes length:', messageBytes.length);
console.log('Signature bytes:', Array.from(signature).slice(0, 10).join(',') + '...');
console.log('Signature bytes length:', signature.length);

// Check if first byte is 0 (which would cause leading 1 in base58)
console.log('First sig byte:', signature[0]);

const sigBase58 = bs58.encode(signature);
console.log('Base58:', sigBase58);
console.log('Base58 length:', sigBase58.length);

// Also check Solana CLI output
const { execSync } = require('child_process');
const cliSig = execSync(`PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH" solana sign-offchain-message --keypair ${walletPath} "${message}"`).toString().trim();
console.log('CLI signature:', cliSig);
console.log('CLI sig length:', cliSig.length);
