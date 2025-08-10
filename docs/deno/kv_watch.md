# Deno KV Watch Feature Documentation

## Overview and Introduction

Deno KV Watch is a powerful feature that enables real-time detection of changes
in the Deno Key/Value (KV) database. This feature is essential for building
reactive applications that need to respond immediately to data modifications,
making it ideal for implementing real-time features such as live dashboards,
collaborative tools, newsfeeds, and chat systems.

> **Note**: KV Watch is currently an unstable API and may be subject to changes
> in future releases. It requires the `--unstable-kv` flag when running your
> application.

## How KV Watch Differs from Regular KV Operations

### Regular KV Operations

Traditional KV operations in Deno are synchronous, one-time actions:

- `kv.get()` - Retrieves a value once
- `kv.set()` - Sets a value once
- `kv.delete()` - Deletes a value once
- Results are returned immediately and the operation completes

### KV Watch Operations

KV Watch provides continuous, asynchronous monitoring:

- Creates a persistent connection to monitor specific keys
- Automatically notifies when watched keys change
- Returns an async iterator or stream for continuous updates
- Maintains an active subscription until explicitly closed

## Real-time Data Synchronization Concepts

### Event-Driven Architecture

KV Watch implements an event-driven pattern where:

1. **Subscribers** register interest in specific keys or key patterns
2. **Publishers** modify data through regular KV operations
3. **Notifications** are automatically sent to all active watchers
4. **Handlers** process incoming change events

### Key Watching Patterns

- **Single Key Watch**: Monitor a specific key for changes
- **Multiple Keys Watch**: Monitor an array of keys simultaneously
- **Pattern-Based Watch**: Watch keys matching specific patterns (useful for
  namespaced data)

## Complete Code Examples

### Basic Watch Implementation

```javascript
// Open a KV database connection
const kv = await Deno.openKv();

// Watch a single key for changes
for await (const [entry] of kv.watch([["counter"]])) {
  console.log(`Counter value updated: ${entry.value}`);

  // Entry contains:
  // - key: The key that changed
  // - value: The new value
  // - versionstamp: Version identifier for the change
}
```

### Stream Reader Approach

```javascript
const kv = await Deno.openKv();

// Get a stream reader for more control
const stream = kv.watch([["counter"]]).getReader();

while (true) {
  const result = await stream.read();

  if (result.done) {
    console.log("Stream closed");
    break;
  }

  // Access the updated entry
  const entry = result.value[0];
  console.log(`Counter updated to: ${entry.value}`);

  // Optionally perform additional operations
  if (entry.value > 100) {
    console.log("Counter exceeded threshold!");
    // Could trigger alerts, cleanup, etc.
  }
}
```

### Server-Sent Events (SSE) Integration

```javascript
const kv = await Deno.openKv();

Deno.serve(async (req) => {
  // Handle SSE endpoint
  if (new URL(req.url).pathname === "/events") {
    const stream = kv.watch([["counter"]]).getReader();

    const body = new ReadableStream({
      async start(controller) {
        // Send initial value
        const initialData = await kv.get(["counter"]);
        controller.enqueue(
          new TextEncoder().encode(
            `data: ${JSON.stringify({ counter: initialData.value })}\n\n`,
          ),
        );

        // Stream updates
        while (true) {
          const result = await stream.read();
          if (result.done) return;

          const data = await kv.get(["counter"]);
          const message = `data: ${
            JSON.stringify({
              counter: data.value,
              timestamp: new Date().toISOString(),
            })
          }\n\n`;

          controller.enqueue(new TextEncoder().encode(message));
        }
      },

      cancel() {
        // Cleanup when client disconnects
        stream.cancel();
      },
    });

    return new Response(body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  }

  // Handle other endpoints
  return new Response("Not found", { status: 404 });
});
```

### Watching Multiple Keys

```javascript
const kv = await Deno.openKv();

// Watch multiple keys simultaneously
const keysToWatch = [
  ["users", "count"],
  ["messages", "latest"],
  ["system", "status"],
];

for await (const entries of kv.watch(keysToWatch)) {
  for (const entry of entries) {
    console.log(`Key ${entry.key.join("/")} changed to: ${entry.value}`);

    // Handle different keys differently
    if (entry.key[0] === "users") {
      handleUserUpdate(entry);
    } else if (entry.key[0] === "messages") {
      handleMessageUpdate(entry);
    } else if (entry.key[0] === "system") {
      handleSystemUpdate(entry);
    }
  }
}

function handleUserUpdate(entry) {
  console.log(`User count is now: ${entry.value}`);
}

function handleMessageUpdate(entry) {
  console.log(`New message: ${entry.value}`);
}

function handleSystemUpdate(entry) {
  console.log(`System status: ${entry.value}`);
}
```

## Event Handling and Subscriptions

### Creating a Subscription Manager

```javascript
class KVSubscriptionManager {
  constructor(kv) {
    this.kv = kv;
    this.subscriptions = new Map();
  }

  async subscribe(keys, handler) {
    const id = crypto.randomUUID();
    const reader = this.kv.watch(keys).getReader();

    const subscription = {
      id,
      keys,
      reader,
      handler,
      active: true,
    };

    this.subscriptions.set(id, subscription);

    // Start processing
    this.process(subscription);

    return id;
  }

  async process(subscription) {
    while (subscription.active) {
      try {
        const result = await subscription.reader.read();
        if (result.done) break;

        // Call the handler with the updates
        await subscription.handler(result.value);
      } catch (error) {
        console.error(`Subscription ${subscription.id} error:`, error);
        subscription.active = false;
      }
    }
  }

  unsubscribe(id) {
    const subscription = this.subscriptions.get(id);
    if (subscription) {
      subscription.active = false;
      subscription.reader.cancel();
      this.subscriptions.delete(id);
    }
  }

  unsubscribeAll() {
    for (const [id] of this.subscriptions) {
      this.unsubscribe(id);
    }
  }
}

// Usage
const kv = await Deno.openKv();
const manager = new KVSubscriptionManager(kv);

// Subscribe to user updates
const userId = await manager.subscribe(
  [["users", "online"]],
  async (entries) => {
    for (const entry of entries) {
      console.log(`Online users: ${entry.value}`);
    }
  },
);

// Later, unsubscribe
manager.unsubscribe(userId);
```

## Use Cases

### 1. Real-time Chat Application

```javascript
const kv = await Deno.openKv();

// Watch for new messages in a chat room
async function watchChatRoom(roomId) {
  const messageKey = ["chat", roomId, "messages"];

  for await (const [entry] of kv.watch([messageKey])) {
    const messages = entry.value || [];
    const latestMessage = messages[messages.length - 1];

    if (latestMessage) {
      displayMessage(latestMessage);
      notifyUsers(roomId, latestMessage);
    }
  }
}

function displayMessage(message) {
  console.log(`[${message.timestamp}] ${message.user}: ${message.text}`);
}

function notifyUsers(roomId, message) {
  // Send notifications to connected users
  broadcast(roomId, {
    type: "new_message",
    data: message,
  });
}
```

### 2. Live Dashboard Updates

```javascript
const kv = await Deno.openKv();

// Watch multiple metrics for a dashboard
async function watchDashboardMetrics() {
  const metricsKeys = [
    ["metrics", "cpu_usage"],
    ["metrics", "memory_usage"],
    ["metrics", "request_count"],
    ["metrics", "error_rate"],
  ];

  for await (const entries of kv.watch(metricsKeys)) {
    const metrics = {};

    for (const entry of entries) {
      const metricName = entry.key[1];
      metrics[metricName] = entry.value;
    }

    updateDashboard(metrics);
  }
}

function updateDashboard(metrics) {
  // Update UI components with new metrics
  console.log("Dashboard Update:", metrics);

  // Check thresholds and trigger alerts
  if (metrics.cpu_usage > 80) {
    sendAlert("High CPU usage detected!");
  }
  if (metrics.error_rate > 0.05) {
    sendAlert("Error rate exceeding threshold!");
  }
}
```

### 3. Collaborative Document Editing

```javascript
const kv = await Deno.openKv();

// Watch document changes for collaborative editing
async function watchDocument(documentId) {
  const docKey = ["documents", documentId];
  const cursorKey = ["cursors", documentId];

  for await (const entries of kv.watch([docKey, cursorKey])) {
    for (const entry of entries) {
      if (entry.key[0] === "documents") {
        handleDocumentChange(documentId, entry.value);
      } else if (entry.key[0] === "cursors") {
        handleCursorUpdate(documentId, entry.value);
      }
    }
  }
}

function handleDocumentChange(docId, content) {
  // Apply operational transform or CRDT merge
  mergeDocumentChanges(docId, content);

  // Update local view
  renderDocument(content);
}

function handleCursorUpdate(docId, cursors) {
  // Show other users' cursor positions
  for (const [userId, position] of Object.entries(cursors)) {
    displayUserCursor(userId, position);
  }
}
```

## Performance and Scalability Considerations

### Connection Management

- **Connection Pooling**: Each watch creates a persistent connection. Manage the
  number of active watches to avoid resource exhaustion.
- **Batching**: Watch multiple related keys in a single operation rather than
  creating separate watchers.

```javascript
// Good - Single watch for multiple keys
const watcher = kv.watch([key1, key2, key3]);

// Avoid - Multiple separate watches
const watcher1 = kv.watch([key1]);
const watcher2 = kv.watch([key2]);
const watcher3 = kv.watch([key3]);
```

### Memory Considerations

- **Buffer Management**: Process watch events promptly to prevent memory buildup
- **Cleanup**: Always cancel watchers when no longer needed

```javascript
const reader = kv.watch([["key"]]).getReader();

try {
  // Process events
  while (true) {
    const result = await reader.read();
    if (result.done) break;

    // Process immediately to avoid buffering
    await processUpdate(result.value);
  }
} finally {
  // Always cleanup
  reader.cancel();
}
```

### Scalability Patterns

#### 1. Event Aggregation

```javascript
class EventAggregator {
  constructor(kv, flushInterval = 1000) {
    this.kv = kv;
    this.buffer = [];
    this.flushInterval = flushInterval;
  }

  async watch(keys, batchHandler) {
    for await (const entries of this.kv.watch(keys)) {
      this.buffer.push(...entries);

      if (this.buffer.length >= 100) {
        await this.flush(batchHandler);
      }
    }
  }

  async flush(handler) {
    if (this.buffer.length === 0) return;

    const batch = [...this.buffer];
    this.buffer = [];

    await handler(batch);
  }
}
```

#### 2. Selective Watching

```javascript
// Watch only active user sessions
async function watchActiveUsers(kv) {
  const activeUserIds = await getActiveUserIds(kv);
  const keysToWatch = activeUserIds.map((id) => ["users", id, "status"]);

  for await (const entries of kv.watch(keysToWatch)) {
    // Process only active user updates
    processActiveUserUpdates(entries);
  }
}
```

## Best Practices for Watching Keys

### 1. Use Specific Key Patterns

```javascript
// Good - Specific keys
const watcher = kv.watch([["users", userId, "profile"]]);

// Avoid - Too broad (if not needed)
const watcher = kv.watch([["users"]]);
```

### 2. Implement Error Handling

```javascript
async function robustWatch(kv, keys, handler) {
  let retryCount = 0;
  const maxRetries = 3;

  while (retryCount < maxRetries) {
    try {
      for await (const entries of kv.watch(keys)) {
        await handler(entries);
      }
      break; // Exit if completed normally
    } catch (error) {
      console.error(`Watch error (attempt ${retryCount + 1}):`, error);
      retryCount++;

      if (retryCount >= maxRetries) {
        throw new Error(`Failed to watch after ${maxRetries} attempts`);
      }

      // Exponential backoff
      await new Promise((resolve) =>
        setTimeout(resolve, Math.pow(2, retryCount) * 1000)
      );
    }
  }
}
```

### 3. Lifecycle Management

```javascript
class WatcherLifecycle {
  constructor(kv) {
    this.kv = kv;
    this.watchers = new Set();
  }

  async start(keys, handler) {
    const reader = this.kv.watch(keys).getReader();
    this.watchers.add(reader);

    try {
      while (true) {
        const result = await reader.read();
        if (result.done) break;
        await handler(result.value);
      }
    } finally {
      this.watchers.delete(reader);
    }
  }

  async shutdown() {
    console.log(`Shutting down ${this.watchers.size} watchers...`);

    const promises = Array.from(this.watchers).map((reader) => reader.cancel());

    await Promise.all(promises);
    this.watchers.clear();

    console.log("All watchers shut down");
  }
}

// Usage with graceful shutdown
const lifecycle = new WatcherLifecycle(kv);

// Start watchers
lifecycle.start([["key1"]], handleUpdate1);
lifecycle.start([["key2"]], handleUpdate2);

// Graceful shutdown on signal
Deno.addSignalListener("SIGINT", async () => {
  await lifecycle.shutdown();
  Deno.exit(0);
});
```

### 4. Debouncing and Throttling

```javascript
function debounce(func, delay) {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func(...args), delay);
  };
}

function throttle(func, limit) {
  let inThrottle;
  return (...args) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

// Usage with watch
const kv = await Deno.openKv();

const debouncedHandler = debounce(async (entries) => {
  console.log("Processing after debounce:", entries);
  await expensiveOperation(entries);
}, 500);

const throttledHandler = throttle(async (entries) => {
  console.log("Throttled update:", entries);
  await updateUI(entries);
}, 100);

for await (const entries of kv.watch([["rapidly_changing_key"]])) {
  debouncedHandler(entries); // For expensive operations
  throttledHandler(entries); // For UI updates
}
```

### 5. Testing Watch Functionality

```javascript
// Test helper for watch functionality
async function testWatch() {
  const kv = await Deno.openKv(":memory:");

  // Set up watcher
  const updates = [];
  const watchPromise = (async () => {
    for await (const entries of kv.watch([["test_key"]])) {
      updates.push(entries[0].value);
      if (updates.length >= 3) break;
    }
  })();

  // Simulate updates
  await new Promise((resolve) => setTimeout(resolve, 100));
  await kv.set(["test_key"], "value1");

  await new Promise((resolve) => setTimeout(resolve, 100));
  await kv.set(["test_key"], "value2");

  await new Promise((resolve) => setTimeout(resolve, 100));
  await kv.set(["test_key"], "value3");

  // Wait for watcher to complete
  await watchPromise;

  console.assert(updates.length === 3, "Should receive 3 updates");
  console.assert(updates[0] === "value1", "First update should be value1");
  console.assert(updates[1] === "value2", "Second update should be value2");
  console.assert(updates[2] === "value3", "Third update should be value3");

  console.log("Watch tests passed!");
  kv.close();
}
```

## Running KV Watch Examples

To run any of the examples in this documentation:

```bash
# Run with unstable KV flag
deno run --unstable-kv your-script.ts

# Run with additional permissions if needed
deno run --unstable-kv --allow-net --allow-read your-script.ts

# Run the official Deno example
deno run --unstable-kv https://docs.deno.com/examples/scripts/kv_watch.ts
```

## Additional Resources

- [Deno KV User Guide](https://docs.deno.com/runtime/manual/runtime/kv/)
- [Deno KV API Reference](https://deno.land/api?s=Deno.Kv)
- [Building Real-time Apps with Deno KV](https://deno.com/blog/kv-watch)
- [Deno Deploy KV Documentation](https://docs.deno.com/deploy/kv/)

## Summary

Deno KV Watch is a powerful feature for building real-time, reactive
applications. By understanding its event-driven architecture, implementing
proper error handling, and following best practices for performance and
scalability, you can create robust applications that respond instantly to data
changes. Remember to always use the `--unstable-kv` flag when running
applications with KV Watch, and be prepared for potential API changes as the
feature evolves.
