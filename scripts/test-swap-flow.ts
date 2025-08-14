#!/usr/bin/env -S deno run -A --unstable-kv --env-file=.env

/**
 * Test script for atomic swap flow - both success and intentional failure cases
 * Usage: deno run -A --env-file=.env scripts/test-swap-flow.ts [--fail-mode MODE]
 * 
 * Fail modes:
 * - none (default): Normal successful flow
 * - no-approval: Skip token approvals (causes TransferFromMakerToTakerFailed)
 * - wrong-signature: Use incorrect signature (causes BadSignature)
 * - early-withdraw: Try to withdraw before timelock (causes InvalidTime)
 * - wrong-secret: Use incorrect secret for withdrawal (causes InvalidSecret)
 */

import { $ } from "https://deno.land/x/dax@0.39.2/mod.ts";

// Parse command line arguments
const failMode = Deno.args.includes("--fail-mode") 
  ? Deno.args[Deno.args.indexOf("--fail-mode") + 1] 
  : "none";

const validFailModes = ["none", "no-approval", "wrong-signature", "early-withdraw", "wrong-secret"];
if (!validFailModes.includes(failMode)) {
  console.error(`Invalid fail mode: ${failMode}`);
  console.error(`Valid modes: ${validFailModes.join(", ")}`);
  Deno.exit(1);
}

console.log(`Running test swap flow with fail mode: ${failMode}`);
console.log("=====================================");

// Helper to run command and capture output
async function runCommand(cmd: string): Promise<{ stdout: string; success: boolean }> {
  try {
    // Parse the command to handle "deno task" specially
    if (cmd.startsWith("deno task ")) {
      const parts = cmd.split(" ");
      const taskName = parts[2];
      const args = parts.slice(3).filter(p => p !== "--");
      
      const command = new Deno.Command("deno", {
        args: ["task", taskName, ...args],
        stdout: "piped",
        stderr: "piped",
      });
      
      const { code, stdout, stderr } = await command.output();
      const output = new TextDecoder().decode(stdout);
      
      if (code !== 0) {
        const error = new TextDecoder().decode(stderr);
        return { stdout: error || output, success: false };
      }
      
      return { stdout: output, success: true };
    } else {
      const result = await $`${cmd}`.quiet();
      return { stdout: result.stdout, success: true };
    }
  } catch (e) {
    return { stdout: e.stdout || e.message, success: false };
  }
}

// Main test flow
async function testSwapFlow() {
  // Step 1: Create order
  console.log("\n1. Creating order...");
  const orderCmd = failMode === "early-withdraw" 
    ? "deno task order:create -- --src 8453 --dst 10 --srcAmount 10000000000000000 --dstAmount 10000000000000000 --resolver 0xfdF1dDeB176BEA06c7430166e67E615bC312b7B5 --srcCancelSec 7200 --dstWithdrawSec 3600"
    : "deno task order:create -- --src 8453 --dst 10 --srcAmount 10000000000000000 --dstAmount 10000000000000000 --resolver 0xfdF1dDeB176BEA06c7430166e67E615bC312b7B5 --srcCancelSec 60 --dstWithdrawSec 30";
  
  const orderResult = await runCommand(orderCmd);
  if (!orderResult.success) {
    console.error("Failed to create order:", orderResult.stdout);
    return;
  }
  
  const hashlock = orderResult.stdout.trim();
  console.log(`Order created with hashlock: ${hashlock}`);
  
  // Step 2: Approve tokens (skip if testing no-approval failure)
  if (failMode !== "no-approval") {
    console.log("\n2. Approving tokens...");
    const approveResult = await runCommand("deno task approve:maker -- --chain 8453 --spender protocol --amount 1000000000000000000000");
    if (!approveResult.success && !approveResult.stdout.includes("OK allowance")) {
      console.error("Failed to approve tokens:", approveResult.stdout);
      return;
    }
    console.log("Tokens approved");
  } else {
    console.log("\n2. SKIPPING token approvals (testing failure mode)");
  }
  
  // Step 3: Modify order if testing wrong-signature
  if (failMode === "wrong-signature") {
    console.log("\n3. Corrupting order signature (testing failure mode)...");
    const orderFile = `./data/orders/pending/${hashlock}.json`;
    const orderData = JSON.parse(await Deno.readTextFile(orderFile));
    // Corrupt the signature
    orderData.signature.r = "0x" + "f".repeat(64);
    await Deno.writeTextFile(orderFile, JSON.stringify(orderData, null, 2));
    console.log("Order signature corrupted");
  }
  
  // Step 4: Execute swap
  console.log("\n4. Executing swap...");
  const swapResult = await runCommand(`deno task swap:execute -- --file ./data/orders/pending/${hashlock}.json`);
  
  if (!swapResult.success && failMode !== "none") {
    console.log("Swap execution failed as expected:");
    console.log(swapResult.stdout);
    
    // Try to extract error details
    if (swapResult.stdout.includes("revert_selector")) {
      console.log("\n=== Revert Details ===");
      const selectorMatch = swapResult.stdout.match(/revert_selector:\s*(0x[a-fA-F0-9]+)/);
      const dataMatch = swapResult.stdout.match(/revert_data:\s*(0x[a-fA-F0-9]+)/);
      if (selectorMatch) console.log(`Selector: ${selectorMatch[1]}`);
      if (dataMatch) console.log(`Data: ${dataMatch[1]}`);
    }
    return;
  } else if (swapResult.success && failMode === "none") {
    console.log("Swap executed successfully");
    const escrowAddress = swapResult.stdout.trim();
    if (escrowAddress && escrowAddress !== "0x") {
      console.log(`Destination escrow created at: ${escrowAddress}`);
    }
  } else {
    console.log("Unexpected result:", swapResult);
  }
  
  // Step 5: Test withdrawals
  if (failMode === "early-withdraw") {
    console.log("\n5. Attempting early withdrawal (should fail)...");
    const withdrawResult = await runCommand(`deno task withdraw:dst -- --hashlock ${hashlock}`);
    if (!withdrawResult.success) {
      console.log("Early withdrawal failed as expected:");
      console.log(withdrawResult.stdout);
    } else {
      console.log("WARNING: Early withdrawal succeeded unexpectedly!");
    }
  } else if (failMode === "wrong-secret") {
    console.log("\n5. Attempting withdrawal with wrong secret...");
    // Modify the secret file
    const secretFile = `./data/secrets/${hashlock}.json`;
    const secretData = JSON.parse(await Deno.readTextFile(secretFile));
    secretData.secret = "0x" + "1".repeat(64);
    await Deno.writeTextFile(secretFile, JSON.stringify(secretData, null, 2));
    
    const withdrawResult = await runCommand(`deno task withdraw:dst -- --hashlock ${hashlock}`);
    if (!withdrawResult.success) {
      console.log("Withdrawal with wrong secret failed as expected:");
      console.log(withdrawResult.stdout);
    } else {
      console.log("WARNING: Withdrawal with wrong secret succeeded unexpectedly!");
    }
  } else if (failMode === "none") {
    console.log("\n5. Attempting destination withdrawal...");
    const withdrawResult = await runCommand(`deno task withdraw:dst -- --hashlock ${hashlock} --wait`);
    if (withdrawResult.success) {
      console.log("Destination withdrawal successful:");
      console.log(`Transaction: ${withdrawResult.stdout.trim()}`);
      
      // Also try source withdrawal
      console.log("\n6. Attempting source withdrawal...");
      const srcWithdrawResult = await runCommand(`deno task withdraw:src -- --hashlock ${hashlock}`);
      if (srcWithdrawResult.success) {
        console.log("Source withdrawal successful:");
        console.log(`Transaction: ${srcWithdrawResult.stdout.trim()}`);
      } else {
        console.log("Source withdrawal failed:", srcWithdrawResult.stdout);
      }
    } else {
      console.log("Destination withdrawal failed:", withdrawResult.stdout);
    }
  }
  
  // Step 6: Check final status
  console.log("\n7. Checking final status...");
  const statusResult = await runCommand(`deno task status -- --hashlock ${hashlock}`);
  console.log("Final status:", statusResult.stdout);
}

// Run the test
testSwapFlow().catch(console.error);