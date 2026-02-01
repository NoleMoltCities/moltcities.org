const bs58 = require('bs58');

// Our API's base58Decode function
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function apiBase58Decode(str) {
  const bytes = [0];
  for (const char of str) {
    const value = BASE58_ALPHABET.indexOf(char);
    if (value === -1) throw new Error('Invalid base58 character');
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = bytes[i] * 58 + value;
      if (bytes[i] > 255) {
        if (i + 1 >= bytes.length) bytes.push(0);
        bytes[i + 1] += Math.floor(bytes[i] / 256);
        bytes[i] %= 256;
      }
    }
  }
  // Count leading zeros in input
  let leadingZeros = 0;
  for (const char of str) {
    if (char === '1') leadingZeros++;
    else break;
  }
  const result = new Uint8Array(leadingZeros + bytes.length);
  result.set(bytes.reverse(), leadingZeros);
  return result;
}

// Test with our signature
const sig = '2ZV96cH8urTZmNwA3SWXCT4GqfWB3KiydUv26xEtyThpJtetc958eTGgmXbSq7nbtprcaMsqYdz3o4wCW2tjMhP8';

console.log('Signature:', sig);
console.log('Length:', sig.length);

console.log('\nbs58 library decode:');
const bs58Decoded = bs58.decode(sig);
console.log('Length:', bs58Decoded.length);
console.log('First 10 bytes:', Array.from(bs58Decoded.slice(0, 10)));

console.log('\nAPI base58Decode:');
const apiDecoded = apiBase58Decode(sig);
console.log('Length:', apiDecoded.length);
console.log('First 10 bytes:', Array.from(apiDecoded.slice(0, 10)));

console.log('\nAre they equal:', Buffer.from(bs58Decoded).equals(Buffer.from(apiDecoded)));
