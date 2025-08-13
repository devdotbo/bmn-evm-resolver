#!/usr/bin/env -S deno run -A --env-file=.env

// Aggregate status for one or all swaps

import { readJson } from "./_fs.ts";

function getArg(name: string): string | undefined {
  const idx = Deno.args.findIndex((a) => a === `--${name}`);
  if (idx >= 0) return Deno.args[idx + 1];
  return undefined;
}

async function statusFor(hashlock: string) {
  try {
    const s = await readJson<any>(`./data/swaps/${hashlock}/status.json`);
    console.log(JSON.stringify(s, null, 2));
  } catch (e) {
    console.error(`No status for ${hashlock}:`, e.message || e);
  }
}

async function all() {
  try {
    for await (const entry of Deno.readDir("./data/swaps")) {
      if (entry.isDirectory) await statusFor(entry.name);
    }
  } catch (_e) {
    console.log("No swaps yet");
  }
}

async function main() {
  const hashlock = getArg("hashlock");
  if (hashlock) return await statusFor(hashlock);
  return await all();
}

main().catch((e) => {
  console.error(e);
  Deno.exit(1);
});


