/**
 * Test suite that exposes initialization bugs in alice-service-orpc.ts
 * 
 * RUN THIS TEST TO SEE THE BUGS:
 * deno test tests/unit/alice-service-orpc-bugs.test.ts --allow-all --unstable-kv
 * 
 * The bugs exposed:
 * 1. SwapStateManager.init() is never called -> KV store not initialized
 * 2. EventMonitorService.monitorEscrowCreation() doesn't exist
 * 3. Wrong SwapStatus enum values used
 */

import { assertEquals, assertRejects } from "https://deno.land/std@0.220.0/assert/mod.ts";
import { describe, it } from "https://deno.land/std@0.220.0/testing/bdd.ts";

describe("🔴 AliceServiceWithOrpc - BUGS EXPOSED", () => {
  
  it("BUG #1: SwapStateManager not initialized - will cause runtime errors", async () => {
    console.log("\n❌ BUG #1: SwapStateManager.init() is never called");
    console.log("Location: alice-service-orpc.ts line 135-156 (start method)");
    console.log("Impact: Service will crash when startOrderMonitoring() calls getPendingSwaps()");
    
    // Import the actual SwapStateManager
    const { SwapStateManager } = await import("../../src/state/swap-state-manager.ts");
    
    // This is what happens in alice-service-orpc.ts
    const swapStateManager = new SwapStateManager(":memory:");
    // ❌ BUG: init() is NOT called in constructor or start()
    
    // This will fail with the actual error users will see
    try {
      await swapStateManager.getPendingSwaps();
      throw new Error("Should have failed!");
    } catch (error) {
      console.log(`\nActual error: ${(error as Error).message}`);
      console.log("\n✅ FIX: Add this line in start() method at line 139:");
      console.log("    await this.swapStateManager.init();");
      
      // Verify it's the expected error
      const errorMessage = (error as Error).message;
      assertEquals(
        errorMessage.includes("Cannot read properties") || 
        errorMessage.includes("not initialized") ||
        errorMessage.includes("undefined"),
        true,
        "Should fail due to uninitialized KV store"
      );
    }
    
    // Clean up
    await swapStateManager.init();
    const kv = (swapStateManager as any).kv;
    if (kv) kv.close();
  });

  it("BUG #2: EventMonitorService missing critical method", async () => {
    console.log("\n❌ BUG #2: EventMonitorService.monitorEscrowCreation() doesn't exist");
    console.log("Location: alice-service-orpc.ts lines 188 and 197");
    console.log("Impact: Service will crash immediately when startEscrowMonitoring() is called");
    
    // Import the actual EventMonitorService
    const { EventMonitorService } = await import("../../src/services/event-monitor.ts");
    
    const eventMonitor = new EventMonitorService();
    
    // Check if the method exists
    const methodExists = typeof (eventMonitor as any).monitorEscrowCreation === "function";
    console.log(`\nMethod exists: ${methodExists}`);
    
    assertEquals(methodExists, false, "monitorEscrowCreation should NOT exist (this is the bug)");
    
    // This is what happens in alice-service-orpc.ts at line 188
    try {
      (eventMonitor as any).monitorEscrowCreation(
        8453, // base.id
        async (event: any) => console.log(event),
        new AbortController().signal
      );
      throw new Error("Should have thrown TypeError!");
    } catch (error) {
      console.log(`\nActual error: ${error}`);
      console.log("\n✅ FIX: Add this method to EventMonitorService class:");
      console.log(`
    monitorEscrowCreation(
      chainId: number,
      callback: (event: EscrowCreatedEvent) => Promise<void> | void,
      signal?: AbortSignal
    ): void {
      // Monitor escrow creation events on the specified chain
      // Implementation details...
    }
      `);
      
      assertEquals(error instanceof TypeError, true, "Should throw TypeError");
    }
  });

  it("BUG #3: Wrong SwapStatus enum values throughout the file", async () => {
    console.log("\n❌ BUG #3: Incorrect SwapStatus enum values used");
    console.log("Location: Multiple places in alice-service-orpc.ts");
    console.log("Impact: Type errors and incorrect status tracking");
    
    // Import the actual SwapStatus enum
    const { SwapStatus } = await import("../../src/state/swap-state-manager.ts");
    
    // Check what values actually exist
    const actualValues = Object.values(SwapStatus);
    console.log("\n✅ Actual SwapStatus values in SwapStateManager:");
    actualValues.forEach(v => console.log(`  - SwapStatus.${v}`));
    
    // Check what alice-service-orpc.ts is trying to use
    const incorrectValues = [
      "SOURCE_DEPOSITED",      // Should be ALICE_DEPOSITED
      "DESTINATION_FUNDED",    // Should be BOB_DEPOSITED  
      "DESTINATION_WITHDRAWN", // Should be DEST_WITHDRAWN
    ];
    
    console.log("\n❌ Incorrect values used in alice-service-orpc.ts:");
    incorrectValues.forEach(v => console.log(`  - SwapStatus.${v} (doesn't exist)`));
    
    // Verify these don't exist
    incorrectValues.forEach(value => {
      assertEquals(
        (SwapStatus as any)[value],
        undefined,
        `SwapStatus.${value} should not exist`
      );
    });
    
    console.log("\n✅ FIX: Replace throughout alice-service-orpc.ts:");
    console.log("  - SwapStatus.SOURCE_DEPOSITED → SwapStatus.ALICE_DEPOSITED");
    console.log("  - SwapStatus.DESTINATION_FUNDED → SwapStatus.BOB_DEPOSITED");
    console.log("  - SwapStatus.DESTINATION_WITHDRAWN → SwapStatus.DEST_WITHDRAWN");
  });

  it("SUMMARY: All bugs and their fixes", () => {
    console.log("\n" + "=".repeat(70));
    console.log("📋 SUMMARY OF BUGS IN alice-service-orpc.ts");
    console.log("=".repeat(70));
    
    const fixes = `
🔧 REQUIRED FIXES:

1. In alice-service-orpc.ts at line 139 (start method), add:
   await this.swapStateManager.init();

2. In src/services/event-monitor.ts, add the monitorEscrowCreation method:
   monitorEscrowCreation(
     chainId: number,
     callback: (event: EscrowCreatedEvent) => Promise<void> | void,
     signal?: AbortSignal
   ): void {
     // Implementation
   }

3. In alice-service-orpc.ts, replace all incorrect enum values:
   - Line 231: SOURCE_DEPOSITED → ALICE_DEPOSITED
   - Line 243: DESTINATION_FUNDED → BOB_DEPOSITED
   - Lines 277, 347: DESTINATION_WITHDRAWN → DEST_WITHDRAWN

4. Additional undefined values to fix:
   - Line 264: SOURCE_DEPOSITED → ALICE_DEPOSITED
   - Line 269: DESTINATION_FUNDED → BOB_DEPOSITED

These fixes will prevent runtime crashes and ensure proper operation.
`;
    
    console.log(fixes);
    console.log("=".repeat(70));
    
    // This test always passes, it's just for documentation
    assertEquals(true, true);
  });
});