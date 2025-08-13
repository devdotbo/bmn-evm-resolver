/**
 * Unit Tests for EventMonitorService (Fixed Version)
 * 
 * Comprehensive test coverage for blockchain event monitoring including:
 * - Service initialization and configuration
 * - Event listener management
 * - Event handling and emission
 * - Error handling
 */

import {
  assertEquals,
  assertExists,
  assert,
  spy,
  assertSpyCalls,
  delay,
} from "../../setup.ts";
import { EventMonitorService } from "../../../src/services/event-monitor.ts";
import type {
  OrderFilledEvent,
  EscrowCreatedEvent,
  TokensDepositedEvent,
  SecretRevealedEvent,
} from "../../../src/services/event-monitor.ts";
import type { Hex, Address, Log } from "viem";
import { base, optimism } from "viem/chains";

// Test constants
const TEST_API_KEY = "test_api_key_123";
const TEST_ORDER_HASH = "0x1234567890123456789012345678901234567890123456789012345678901234" as Hex;
const TEST_HASHLOCK = "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890" as Hex;
const TEST_SECRET = "0xfedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321" as Hex;
const TEST_ESCROW_ADDRESS = "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb8" as Address;
const TEST_ALICE_ADDRESS = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as Address;
const TEST_BOB_ADDRESS = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC" as Address;
const TEST_AMOUNT = 1000000000000000000n; // 1 token

Deno.test("EventMonitorService - Core Functionality", async (t) => {
  await t.step("Initialization", async () => {
    // Test default initialization
    const service1 = new EventMonitorService();
    assertExists(service1);
    assertEquals(service1.isActive(), false);

    // Test with API key
    const service2 = new EventMonitorService(TEST_API_KEY);
    assertExists(service2);
    assertEquals(service2.isActive(), false);
  });

  await t.step("Event Listener Management", async () => {
    const service = new EventMonitorService();
    const callback1 = spy(() => {});
    const callback2 = spy(() => {});
    
    // Test registration
    service.on("OrderFilled", callback1);
    service.on("OrderFilled", callback2);
    
    // Test emission
    const event: OrderFilledEvent = {
      orderHash: TEST_ORDER_HASH,
      remainingAmount: 500000000000000000n,
      blockNumber: 1000n,
      transactionHash: "0xabc123" as Hex,
    };
    
    await (service as any).emit("OrderFilled", event);
    
    assertSpyCalls(callback1, 1);
    assertSpyCalls(callback2, 1);
    
    // Test removal
    service.off("OrderFilled", callback1);
    await (service as any).emit("OrderFilled", event);
    
    assertSpyCalls(callback1, 1); // Still 1
    assertSpyCalls(callback2, 2); // Now 2
  });

  await t.step("All Event Types Support", async () => {
    const service = new EventMonitorService();
    const callbacks = {
      orderFilled: spy(() => {}),
      sourceEscrow: spy(() => {}),
      destEscrow: spy(() => {}),
      tokensDeposited: spy(() => {}),
      secretRevealed: spy(() => {}),
    };
    
    service.on("OrderFilled", callbacks.orderFilled);
    service.on("SourceEscrowCreated", callbacks.sourceEscrow);
    service.on("DestEscrowCreated", callbacks.destEscrow);
    service.on("TokensDeposited", callbacks.tokensDeposited);
    service.on("SecretRevealed", callbacks.secretRevealed);
    
    // Emit each event type
    await (service as any).emit("OrderFilled", { orderHash: TEST_ORDER_HASH });
    await (service as any).emit("SourceEscrowCreated", { escrowAddress: TEST_ESCROW_ADDRESS });
    await (service as any).emit("DestEscrowCreated", { escrowAddress: TEST_ESCROW_ADDRESS });
    await (service as any).emit("TokensDeposited", { escrowAddress: TEST_ESCROW_ADDRESS });
    await (service as any).emit("SecretRevealed", { escrowAddress: TEST_ESCROW_ADDRESS });
    
    assertSpyCalls(callbacks.orderFilled, 1);
    assertSpyCalls(callbacks.sourceEscrow, 1);
    assertSpyCalls(callbacks.destEscrow, 1);
    assertSpyCalls(callbacks.tokensDeposited, 1);
    assertSpyCalls(callbacks.secretRevealed, 1);
  });

  await t.step("Async Event Handling", async () => {
    const service = new EventMonitorService();
    let processed = false;
    
    const asyncCallback = spy(async (event: OrderFilledEvent) => {
      await delay(10);
      processed = true;
    });
    
    service.on("OrderFilled", asyncCallback);
    
    const event: OrderFilledEvent = {
      orderHash: TEST_ORDER_HASH,
      remainingAmount: 0n,
      blockNumber: 1000n,
      transactionHash: "0x789" as Hex,
    };
    
    await (service as any).emit("OrderFilled", event);
    
    assert(processed, "Async callback should have been processed");
    assertSpyCalls(asyncCallback, 1);
  });

  await t.step("Error Handling in Listeners", async () => {
    const service = new EventMonitorService();
    const errorCallback = spy(() => {
      throw new Error("Test error");
    });
    const normalCallback = spy(() => {});
    
    service.on("OrderFilled", errorCallback);
    service.on("OrderFilled", normalCallback);
    
    const event: OrderFilledEvent = {
      orderHash: TEST_ORDER_HASH,
      remainingAmount: 0n,
      blockNumber: 1000n,
      transactionHash: "0xabc" as Hex,
    };
    
    // Should not throw despite error in first callback
    await (service as any).emit("OrderFilled", event);
    
    assertSpyCalls(errorCallback, 1);
    assertSpyCalls(normalCallback, 1);
  });
});

Deno.test("EventMonitorService - Event Processing", async (t) => {
  await t.step("OrderFilled Event Processing", async () => {
    const service = new EventMonitorService();
    let capturedEvent: OrderFilledEvent | null = null;
    
    service.on("OrderFilled", (event) => {
      capturedEvent = event;
    });
    
    const log: Log = {
      args: {
        orderHash: TEST_ORDER_HASH,
        remainingAmount: 250000000000000000n,
      },
      blockNumber: 1001n,
      transactionHash: "0xabc123" as Hex,
    } as any;
    
    await (service as any).handleOrderFilled(log, base.id);
    
    assertExists(capturedEvent);
    assertEquals(capturedEvent!.orderHash, TEST_ORDER_HASH);
    assertEquals(capturedEvent!.remainingAmount, 250000000000000000n);
    assertEquals(capturedEvent!.blockNumber, 1001n);
    assertEquals(capturedEvent!.transactionHash, "0xabc123");
  });

  await t.step("OrderFilled with Missing Data", async () => {
    const service = new EventMonitorService();
    let capturedEvent: OrderFilledEvent | null = null;
    
    service.on("OrderFilled", (event) => {
      capturedEvent = event;
    });
    
    const log: Log = {
      args: {
        orderHash: TEST_ORDER_HASH,
      },
    } as any;
    
    await (service as any).handleOrderFilled(log, base.id);
    
    assertExists(capturedEvent);
    assertEquals(capturedEvent!.orderHash, TEST_ORDER_HASH);
    assertEquals(capturedEvent!.remainingAmount, 0n); // Default value
    assertEquals(capturedEvent!.blockNumber, 0n); // Default value
    assertEquals(capturedEvent!.transactionHash, "0x"); // Default value
  });

  await t.step("Source Escrow Creation", async () => {
    const service = new EventMonitorService();
    let capturedEvent: EscrowCreatedEvent | null = null;
    
    service.on("SourceEscrowCreated", (event) => {
      capturedEvent = event;
    });
    
    const log: Log = {
      args: {
        escrow: TEST_ESCROW_ADDRESS,
        hashlock: TEST_HASHLOCK,
        orderHash: TEST_ORDER_HASH,
        maker: TEST_ALICE_ADDRESS,
        taker: TEST_BOB_ADDRESS,
        amount: TEST_AMOUNT,
      },
      blockNumber: 1002n,
      transactionHash: "0xdef456" as Hex,
    } as any;
    
    await (service as any).handleEscrowCreated(log, base.id, true);
    
    assertExists(capturedEvent);
    assertEquals(capturedEvent!.escrowAddress, TEST_ESCROW_ADDRESS);
    assertEquals(capturedEvent!.hashlock, TEST_HASHLOCK);
    assertEquals(capturedEvent!.orderHash, TEST_ORDER_HASH);
    assertEquals(capturedEvent!.maker, TEST_ALICE_ADDRESS);
    assertEquals(capturedEvent!.taker, TEST_BOB_ADDRESS);
    assertEquals(capturedEvent!.amount, TEST_AMOUNT);
    assertEquals(capturedEvent!.chainId, base.id);
    assertEquals(capturedEvent!.isSource, true);
  });

  await t.step("Destination Escrow Creation", async () => {
    const service = new EventMonitorService();
    let capturedEvent: EscrowCreatedEvent | null = null;
    
    service.on("DestEscrowCreated", (event) => {
      capturedEvent = event;
    });
    
    const log: Log = {
      args: {
        escrowAddress: TEST_ESCROW_ADDRESS,
        hashlock: TEST_HASHLOCK,
        protocol: TEST_ALICE_ADDRESS,
        amount: TEST_AMOUNT,
      },
      blockNumber: 1003n,
      transactionHash: "0x789abc" as Hex,
    } as any;
    
    await (service as any).handleEscrowCreated(log, optimism.id, false);
    
    assertExists(capturedEvent);
    assertEquals(capturedEvent!.escrowAddress, TEST_ESCROW_ADDRESS);
    assertEquals(capturedEvent!.chainId, optimism.id);
    assertEquals(capturedEvent!.isSource, false);
  });

  await t.step("Hashlock as OrderHash Fallback", async () => {
    const service = new EventMonitorService();
    let capturedEvent: EscrowCreatedEvent | null = null;
    
    service.on("SourceEscrowCreated", (event) => {
      capturedEvent = event;
    });
    
    const log: Log = {
      args: {
        escrow: TEST_ESCROW_ADDRESS,
        hashlock: TEST_HASHLOCK,
        // orderHash missing - should use hashlock
      },
      blockNumber: 1004n,
      transactionHash: "0xabc789" as Hex,
    } as any;
    
    await (service as any).handleEscrowCreated(log, base.id, true);
    
    assertExists(capturedEvent);
    assertEquals(capturedEvent!.orderHash, TEST_HASHLOCK);
  });
});

Deno.test("EventMonitorService - Error Resilience", async (t) => {
  await t.step("Invalid OrderFilled Log", async () => {
    const service = new EventMonitorService();
    
    // Pass invalid log structure
    const invalidLog = {} as Log;
    
    // Should not throw
    await (service as any).handleOrderFilled(invalidLog, base.id);
    assert(true, "Should handle error without throwing");
  });

  await t.step("Invalid EscrowCreated Log", async () => {
    const service = new EventMonitorService();
    
    // Pass log with missing args
    const invalidLog = { args: null } as any;
    
    // Should not throw
    await (service as any).handleEscrowCreated(invalidLog, base.id, true);
    assert(true, "Should handle error without throwing");
  });

  await t.step("Multiple Errors in Callbacks", async () => {
    const service = new EventMonitorService();
    
    const errorCallback1 = spy(() => {
      throw new Error("Error 1");
    });
    const errorCallback2 = spy(() => {
      throw new Error("Error 2");
    });
    const normalCallback = spy(() => {});
    
    service.on("OrderFilled", errorCallback1);
    service.on("OrderFilled", errorCallback2);
    service.on("OrderFilled", normalCallback);
    
    const event: OrderFilledEvent = {
      orderHash: TEST_ORDER_HASH,
      remainingAmount: 0n,
      blockNumber: 1009n,
      transactionHash: "0x123" as Hex,
    };
    
    // Should not throw and should call all callbacks
    await (service as any).emit("OrderFilled", event);
    
    assertSpyCalls(errorCallback1, 1);
    assertSpyCalls(errorCallback2, 1);
    assertSpyCalls(normalCallback, 1);
  });
});

Deno.test("EventMonitorService - Integration Flow", async (t) => {
  await t.step("Complete Order Flow", async () => {
    const service = new EventMonitorService();
    const events: any[] = [];
    
    service.on("OrderFilled", (event) => {
      events.push({ type: "OrderFilled", event });
    });
    
    service.on("SourceEscrowCreated", (event) => {
      events.push({ type: "SourceEscrowCreated", event });
    });
    
    service.on("TokensDeposited", (event) => {
      events.push({ type: "TokensDeposited", event });
    });
    
    // Simulate order filled
    await (service as any).handleOrderFilled(
      {
        args: { orderHash: TEST_ORDER_HASH, remainingAmount: 0n },
        blockNumber: 2000n,
        transactionHash: "0x111" as Hex,
      } as any,
      base.id
    );
    
    // Simulate escrow created
    await (service as any).handleEscrowCreated(
      {
        args: {
          escrow: TEST_ESCROW_ADDRESS,
          hashlock: TEST_HASHLOCK,
          orderHash: TEST_ORDER_HASH,
          maker: TEST_ALICE_ADDRESS,
          taker: TEST_BOB_ADDRESS,
          amount: TEST_AMOUNT,
        },
        blockNumber: 2001n,
        transactionHash: "0x222" as Hex,
      } as any,
      base.id,
      true
    );
    
    assertEquals(events.length, 2);
    assertEquals(events[0].type, "OrderFilled");
    assertEquals(events[1].type, "SourceEscrowCreated");
    assertEquals(events[0].event.orderHash, TEST_ORDER_HASH);
    assertEquals(events[1].event.orderHash, TEST_ORDER_HASH);
  });

  await t.step("Concurrent Events from Multiple Chains", async () => {
    const service = new EventMonitorService();
    const events: any[] = [];
    
    service.on("SourceEscrowCreated", (event) => {
      events.push({ chain: event.chainId, type: "Source" });
    });
    
    service.on("DestEscrowCreated", (event) => {
      events.push({ chain: event.chainId, type: "Dest" });
    });
    
    // Simulate events from both chains
    await Promise.all([
      (service as any).handleEscrowCreated(
        {
          args: { escrow: TEST_ESCROW_ADDRESS, hashlock: TEST_HASHLOCK },
          blockNumber: 3000n,
          transactionHash: "0x333" as Hex,
        } as any,
        base.id,
        true
      ),
      (service as any).handleEscrowCreated(
        {
          args: { escrow: TEST_ESCROW_ADDRESS, hashlock: TEST_HASHLOCK },
          blockNumber: 3001n,
          transactionHash: "0x444" as Hex,
        } as any,
        optimism.id,
        false
      ),
    ]);
    
    assertEquals(events.length, 2);
    assert(events.some(e => e.chain === base.id && e.type === "Source"));
    assert(events.some(e => e.chain === optimism.id && e.type === "Dest"));
  });
});

Deno.test("EventMonitorService - Monitoring State", async (t) => {
  await t.step("Start/Stop State Management", async () => {
    const service = new EventMonitorService();
    
    // Initial state
    assertEquals(service.isActive(), false);
    
    // Can stop when not monitoring (should not throw)
    await service.stopMonitoring();
    assertEquals(service.isActive(), false);
    
    // Note: We can't test actual start/stop without mocking the clients
    // which causes issues with the stub library. The implementation
    // is tested through integration tests.
  });
});