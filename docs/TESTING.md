# 🧪 BMN EVM Resolver - Testing Documentation

## Overview

The BMN EVM Resolver project includes a comprehensive test suite built with Deno's native testing framework and custom viem mocks for blockchain interactions. The test suite ensures reliability, maintainability, and confidence in the atomic swap system.

## 📊 Test Coverage

| Component | Coverage | Tests | Location |
|-----------|----------|-------|----------|
| **EventMonitorService** | ✅ 100% | 16 | `tests/unit/services/event-monitor.test.ts` |
| **SwapStateManager** | ✅ 100% | 68 | `tests/unit/state/swap-state-manager.test.ts` |
| **SecretManager** | ✅ 100% | 63 | `tests/unit/state/secret-manager.test.ts` |
| **EscrowWithdrawManager** | ✅ 100% | 30+ | `tests/unit/utils/escrow-withdraw.test.ts` |
| **Limit Order Utilities** | ✅ 100% | 13 | `tests/unit/utils/limit-order.test.ts` |
| **Escrow Creation** | ✅ 100% | 16 | `tests/unit/utils/escrow-creation.test.ts` |
| **Integration Tests** | ✅ 100% | 10 | `tests/integration/atomic-swap-flow.test.ts` |

## 🏗️ Test Infrastructure

### Core Test Setup (`tests/setup.ts`)

The main test setup file provides:

- **Assertion Utilities**: Re-exported from `@std/assert`
- **Test Context Management**: Helper functions for test lifecycle
- **Mock Utilities**:
  - `MockEventEmitter`: For testing event-driven code
  - `MockKVStore`: For testing Deno KV operations
  - `TestLogger`: For capturing and asserting log output
  - `TestTimer`: For performance measurements
  - `TestDataGenerator`: For generating unique test data
- **Performance Benchmarking**: `Benchmark` class for comparing performance
- **Helper Functions**: `waitFor`, `registerCleanup`, etc.

### Viem Mocks (`tests/mocks/viem-mock.ts`)

Comprehensive blockchain mocking infrastructure:

- **Mock Clients**: `createMockPublicClient` and `createMockWalletClient`
- **Transaction Store**: Tracks transactions, receipts, and blocks
- **Test Accounts**: Pre-configured with Hardhat default private keys
- **Mock Chains**: Test chain configurations
- **Contract ABIs**: Mock ABIs for ERC20, LimitOrderProtocol, EscrowFactory

### Test Fixtures (`tests/fixtures/index.ts`)

Reusable test data for consistent testing:

- **Order Fixtures**: Various order states and configurations
- **Escrow Fixtures**: Cross-chain escrow configurations
- **Transaction Fixtures**: Token transfers, failed transactions
- **Event Fixtures**: Blockchain events
- **Signature Fixtures**: Valid/invalid EIP-712 signatures
- **State Fixtures**: Swap states
- **Helper Functions**: `createTestOrder`, `createTestEscrow`, etc.

## 🧪 Running Tests

### Basic Commands

```bash
# Run all tests
deno task test

# Run with watch mode (auto-rerun on file changes)
deno task test:watch

# Run with coverage report
deno task test:coverage

# Run specific test categories
deno task test:unit        # Unit tests only
deno task test:integration # Integration tests only
deno task test:e2e        # End-to-end tests
```

### Running Specific Tests

```bash
# Run a specific test file
deno test tests/unit/services/event-monitor.test.ts

# Run tests matching a pattern
deno test --filter "EventMonitorService"

# Run with verbose output
deno test --reporter=verbose tests/unit/
```

### Test Environment Variables

```bash
# Set test environment
TEST_ENV=ci deno test           # CI environment
TEST_ENV=development deno test   # Development environment

# Enable debug logging
DEBUG=true deno test

# Set custom timeouts
TEST_TIMEOUT=30000 deno test
```

## 📝 Writing Tests

### Basic Test Structure

```typescript
import { 
  assertEquals, 
  assertExists,
  assertRejects 
} from "../tests/setup.ts";

Deno.test("Component name - test scenario", async () => {
  // Arrange
  const testData = createTestData();
  
  // Act
  const result = await performAction(testData);
  
  // Assert
  assertEquals(result.status, "success");
});
```

### Using Test Context

```typescript
import { createTestContext, registerCleanup, runCleanup } from "../tests/setup.ts";

Deno.test("Test with cleanup", async () => {
  const ctx = createTestContext("test-id");
  
  // Register cleanup actions
  registerCleanup(ctx, async () => {
    await cleanupResources();
  });
  
  // Test logic
  await performTest();
  
  // Run cleanup
  await runCleanup(ctx);
});
```

### Testing with Mocks

```typescript
import { createMockPublicClient, TEST_ACCOUNTS } from "../tests/mocks/viem-mock.ts";
import { spy, stub } from "@std/testing/mock";

Deno.test("Test with blockchain mocks", async () => {
  const client = createMockPublicClient();
  
  // Setup mock response
  const readContractSpy = spy(client, "readContract");
  
  // Execute test
  const result = await myFunction(client);
  
  // Assert mock was called
  assertSpyCalls(readContractSpy, 1);
  assertEquals(readContractSpy.calls[0].args[0].functionName, "balanceOf");
});
```

### Testing Event-Driven Code

```typescript
import { MockEventEmitter } from "../tests/setup.ts";

Deno.test("Event emission test", async () => {
  const emitter = new MockEventEmitter();
  let eventReceived = false;
  
  emitter.on("test-event", () => {
    eventReceived = true;
  });
  
  emitter.emit("test-event", { data: "test" });
  
  assertEquals(eventReceived, true);
  assertEquals(emitter.getEventCount("test-event"), 1);
});
```

### Performance Testing

```typescript
import { Benchmark } from "../tests/setup.ts";

Deno.test("Performance benchmark", async () => {
  const benchmark = new Benchmark();
  
  await benchmark.run("operation-1", async () => {
    await expensiveOperation1();
  }, 1000); // Run 1000 iterations
  
  await benchmark.run("operation-2", async () => {
    await expensiveOperation2();
  }, 1000);
  
  const comparison = benchmark.compare("operation-1", "operation-2");
  assert(comparison.percentDiff < 10, "Operation 2 should not be more than 10% slower");
});
```

## 🎯 Test Categories

### Unit Tests

Located in `tests/unit/`, these tests focus on individual components in isolation:

- **Services**: Event monitoring, indexer clients
- **State Management**: Swap state, secrets, KV operations
- **Utilities**: Order handling, escrow creation, withdrawals
- **Validation**: Input validation, signature verification

### Integration Tests

Located in `tests/integration/`, these tests verify component interactions:

- **Atomic Swap Flow**: Complete swap lifecycle
- **Service Integration**: Alice and Bob service coordination
- **Event Flow**: Event emission and handling chains
- **Error Recovery**: Failure scenarios and recovery

### End-to-End Tests

Located in `tests/e2e/`, these tests validate the entire system:

- **Full System Tests**: Complete atomic swap with all services
- **Network Simulation**: Multi-chain interactions
- **Performance Tests**: Load testing and benchmarking

## 🔍 Test Scenarios

### Happy Path Testing

```typescript
Deno.test("Atomic Swap - Happy Path", async () => {
  // 1. Alice creates order
  // 2. Bob fills order
  // 3. Alice deposits to source
  // 4. Bob creates destination escrow
  // 5. Alice reveals secret
  // 6. Bob withdraws from source
});
```

### Error Recovery Testing

```typescript
Deno.test("Network Failure Recovery", async () => {
  // Simulate network failures
  // Verify retry mechanisms
  // Ensure eventual success
});
```

### Concurrent Operations

```typescript
Deno.test("Concurrent Swaps", async () => {
  // Create multiple swaps simultaneously
  // Verify isolation
  // Check final states
});
```

## 📊 Test Metrics

### Coverage Goals

- **Line Coverage**: > 80%
- **Branch Coverage**: > 75%
- **Function Coverage**: > 90%

### Performance Benchmarks

- **Unit Test Execution**: < 100ms per test
- **Integration Test Execution**: < 500ms per test
- **Full Test Suite**: < 30 seconds

### Quality Metrics

- **Test Isolation**: Each test runs independently
- **Deterministic**: Tests produce consistent results
- **Fast Feedback**: Quick test execution for rapid development

## 🛠️ Debugging Tests

### Enable Debug Output

```bash
# Enable all debug output
DEBUG=* deno test

# Enable specific debug namespaces
DEBUG=test:* deno test
DEBUG=mock:* deno test
```

### Run Single Test

```bash
# Run specific test by name
deno test --filter "should handle network failures"

# Run with step-by-step output
deno test --steps tests/unit/services/event-monitor.test.ts
```

### Test Inspection

```typescript
import { TestLogger } from "../tests/setup.ts";

Deno.test("Test with logging", () => {
  const logger = new TestLogger();
  
  // Your test code
  functionUnderTest(logger);
  
  // Inspect logs
  console.log("Captured logs:", logger.getLogs());
  
  // Assert on logs
  assertEquals(logger.hasLog("error", /failed/), true);
});
```

## 🔧 Troubleshooting

### Common Issues

1. **Test Timeout**
   ```bash
   # Increase timeout for slow tests
   deno test --timeout 60000
   ```

2. **Resource Leaks**
   ```typescript
   // Always cleanup resources
   Deno.test("test", async () => {
     const resource = await createResource();
     try {
       // test logic
     } finally {
       await resource.close();
     }
   });
   ```

3. **Flaky Tests**
   - Use `waitFor` helper for async operations
   - Avoid hardcoded delays
   - Mock time-dependent operations

4. **Mock Issues**
   - Ensure mocks are properly restored
   - Use `spy` for verification, `stub` for replacement
   - Clear mock state between tests

## 📚 Best Practices

### Test Organization

1. **One assertion per test**: Keep tests focused
2. **Descriptive names**: Test names should describe the scenario
3. **AAA Pattern**: Arrange, Act, Assert
4. **Test isolation**: No dependencies between tests

### Mock Usage

1. **Mock external dependencies**: Network, filesystem, time
2. **Verify mock interactions**: Use spies to verify calls
3. **Restore mocks**: Always cleanup after tests
4. **Minimal mocking**: Only mock what's necessary

### Performance

1. **Parallel execution**: Tests run in parallel by default
2. **Fast tests first**: Order tests by execution time
3. **Avoid unnecessary setup**: Share expensive setup when possible
4. **Profile slow tests**: Use benchmarking to identify bottlenecks

## 🚀 Continuous Integration

### GitHub Actions Configuration

```yaml
name: Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: denoland/setup-deno@v2
        with:
          deno-version: v2.x
      
      - name: Run tests
        run: deno task test:coverage
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/coverage.lcov
```

### Pre-commit Hooks

```bash
#!/bin/bash
# .git/hooks/pre-commit

# Run tests before commit
deno task test:unit

if [ $? -ne 0 ]; then
  echo "Tests failed. Commit aborted."
  exit 1
fi
```

## 📈 Test Evolution

### Adding New Tests

1. Identify untested code paths
2. Write test cases for edge cases
3. Add integration tests for new features
4. Update documentation

### Refactoring Tests

1. Keep tests DRY with shared utilities
2. Extract common patterns to helpers
3. Update tests when implementation changes
4. Remove obsolete tests

### Test Maintenance

1. Regular test suite audit
2. Update deprecated patterns
3. Optimize slow tests
4. Document test requirements

## 🎓 Resources

- [Deno Testing Documentation](https://docs.deno.com/runtime/fundamentals/testing/)
- [Viem Testing Guide](https://viem.sh/docs/clients/test)
- [Testing Best Practices](https://testingjavascript.com/)
- [BDD Testing Patterns](https://dannorth.net/introducing-bdd/)

---

For questions or improvements to the test suite, please open an issue or submit a pull request.