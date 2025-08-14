#!/usr/bin/env -S deno run --allow-read --allow-write

// Minimal declarations for non-Deno linters
declare const Deno: any;

/**
 * Copies canonical ABIs from the contracts repo `out/` into this resolver's `abis/` dir.
 * - EscrowSrc.sol/EscrowSrc.json -> abis/EscrowSrcV2.json
 * - EscrowDst.sol/EscrowDst.json -> abis/EscrowDstV2.json
 * - SimplifiedEscrowFactoryV2_3.sol/SimplifiedEscrowFactoryV2_3.json -> abis/SimplifiedEscrowFactoryV2_3.json
 */

const _ROOT = new URL("../", import.meta.url).pathname; // unused: kept for future relative paths
const CONTRACTS = new URL("../../bmn-evm-contracts/out/", import.meta.url).pathname;
const ABIS = new URL("../abis/", import.meta.url).pathname;

const sources = [
  {
    from: `${CONTRACTS}EscrowSrc.sol/EscrowSrc.json`,
    to: `${ABIS}EscrowSrcV2.json`,
  },
  {
    from: `${CONTRACTS}EscrowDst.sol/EscrowDst.json`,
    to: `${ABIS}EscrowDstV2.json`,
  },
  {
    from: `${CONTRACTS}SimplifiedEscrowFactoryV2_3.sol/SimplifiedEscrowFactoryV2_3.json`,
    to: `${ABIS}SimplifiedEscrowFactoryV2_3.json`,
  },
];

async function copyFile(from: string, to: string) {
  const data = await Deno.readTextFile(from);
  await Deno.writeTextFile(to, data);
  console.log(`✅ Copied ${from} -> ${to}`);
}

for (const { from, to } of sources) {
  try {
    await copyFile(from, to);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`❌ Failed to copy ${from} -> ${to}: ${msg}`);
  }
}


