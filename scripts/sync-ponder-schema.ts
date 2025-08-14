#!/usr/bin/env -S deno run --allow-read --allow-write

// Minimal declarations for non-Deno linters
declare const Deno: any;

/**
 * Sync the canonical Ponder schema from the indexer into this repo root as `ponder.schema.ts`.
 * Defaults to ../bmn-evm-contracts-indexer/ponder.schema.ts if INDEXER_PONDER_SCHEMA is unset.
 *
 * Override via env:
 *   INDEXER_PONDER_SCHEMA=/abs/path/to/ponder.schema.ts deno run --allow-read --allow-write scripts/sync-ponder-schema.ts
 */

function usage() {
  console.log(`Usage:
  deno run --allow-read --allow-write scripts/sync-ponder-schema.ts
  INDEXER_PONDER_SCHEMA=/abs/path/to/ponder.schema.ts deno run --allow-read --allow-write scripts/sync-ponder-schema.ts
`);
}

try {
  let source = (Deno.env.get("INDEXER_PONDER_SCHEMA") || "").trim();
  if (!source) {
    // Default to sibling indexer repo
    const defaultPath = new URL("../../bmn-evm-contracts-indexer/ponder.schema.ts", import.meta.url).pathname;
    source = defaultPath;
  }

  // Basic existence check
  await Deno.stat(source);

  const target = new URL("../ponder.schema.ts", import.meta.url).pathname;
  const content = await Deno.readTextFile(source);
  await Deno.writeTextFile(target, content);
  console.log(`✅ Copied ${source} -> ${target}`);
} catch (err) {
  console.error(`❌ Failed: ${(err as Error).message}`);
  usage();
  Deno.exit(1);
}


