#!/usr/bin/env -S deno run --allow-read --allow-env
import { keccak256 } from "viem";

function toBytesLen(hex: string) { return (hex.length - 2) / 2; }

function parseOffsetsWord(hex: string) {
  const w = BigInt(hex);
  const ends = Array.from({ length: 8 }, (_, i) => Number((w >> BigInt(i * 32)) & 0xffffffffn));
  const begin7 = Number((w >> 192n) & 0xffffffffn);
  const end7 = ends[7];
  return { ends, begin7, end7 };
}

function lower160(hex: string) {
  const x = BigInt(hex) & ((1n << 160n) - 1n);
  return "0x" + x.toString(16).padStart(40, "0");
}

async function main() {
  const extension = Deno.args[0];
  if (!extension || !extension.startsWith("0x")) {
    console.error("Usage: check-extension.ts 0x<hex_extension>");
    Deno.exit(1);
  }
  const len = toBytesLen(extension);
  const offsetsWord = extension.slice(0, 66);
  const { ends, begin7, end7 } = parseOffsetsWord(offsetsWord);
  const h = keccak256(extension as `0x${string}`);
  console.log("🧩 1inch extension self-check");
  console.log(`  bytes(extension): ${len}`);
  console.log(`  offsets[0..31]:  ${offsetsWord}`);
  console.log(`  end7(begin7):    ${end7} (${begin7})`);
  console.log(`  hash:            ${h}`);
  console.log(`  hash.lower160:   ${lower160(h)}  ← use in order.salt lower160`);
}

if ((import.meta as any).main) await main();


