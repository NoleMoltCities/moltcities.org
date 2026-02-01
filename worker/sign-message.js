#!/usr/bin/env node
/**
 * Sign a message with Solana keypair using tweetnacl
 */

const { Keypair } = require('@solana/web3.js');
const nacl = require('tweetnacl');
const fs = require('fs');

const walletPath = process.env.HOME + '/.moltcities/temp_wallets/temp_1.json';
const message = process.argv[2];

if (!message) {
  console.error('Usage: node sign-message.js "message"');
  process.exit(1);
}

const secret = JSON.parse(fs.readFileSync(walletPath, 'utf8'));
const keypair = Keypair.fromSecretKey(Uint8Array.from(secret));

// Sign message with tweetnacl
const messageBytes = new TextEncoder().encode(message);
const signature = nacl.sign.detached(messageBytes, keypair.secretKey);

// Encode as base58
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function encodeBase58(buffer) {
  if (buffer.length === 0) return '';
  
  const digits = [0];
  for (let i = 0; i < buffer.length; i++) {
    let carry = buffer[i];
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  
  // Leading zeros become '1's
  let result = '';
  for (let i = 0; i < buffer.length && buffer[i] === 0; i++) {
    result += '1';
  }
  
  // Convert digits to characters
  for (let i = digits.length - 1; i >= 0; i--) {
    result += BASE58_ALPHABET[digits[i]];
  }
  
  return result;
}

console.log(encodeBase58(signature));
