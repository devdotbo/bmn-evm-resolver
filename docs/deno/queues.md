# Deno Queues Documentation

## Overview and Introduction

Deno Queues is a powerful asynchronous message processing system built on top of
Deno KV (Key-Value database). It enables developers to offload work to
background processes, schedule tasks for future execution, and build robust
distributed systems with guaranteed message delivery.

### Key Features

- **Built on Deno KV**: Leverages Deno's native key-value database for
  persistence
- **At-least-once delivery**: Guarantees that messages will be processed, even
  in failure scenarios
- **Delayed execution**: Schedule messages to be processed at a specific time in
  the future
- **Automatic retries**: Failed message processing automatically retries with
  configurable backoff
- **Serverless-ready**: Seamlessly integrates with Deno Deploy for automatic
  scaling
- **Type-safe**: Full TypeScript support for message interfaces

> **Note**: Deno Queues is currently part of Deno's unstable APIs and may be
> subject to changes in future versions.

## Key Concepts and Terminology

### Queue

A queue is a data structure that holds messages waiting to be processed. In
Deno, queues are integrated directly into the KV database, providing durability
and distribution.

### Message

A message is any JavaScript value (object, string, number, etc.) that can be
serialized and stored in the queue for processing.

### Enqueue

The process of adding a message to the queue for future processing.

### Listen/Handler

A function that processes messages from the queue as they become available.

### Delivery Guarantees

- **At-least-once**: Messages will be delivered at least once, potentially
  multiple times in failure scenarios
- **Best-effort ordering**: Messages are generally processed in order, but
  strict ordering is not guaranteed

### Backoff Schedule

A configurable retry policy that determines how long to wait between retry
attempts when message processing fails.

### Undelivered Message Backup

A fallback mechanism to store messages that couldn't be successfully processed
after all retry attempts.

## How Queues Work in Deno

### Architecture

1. **Message Storage**: Messages are stored in Deno KV, providing durability and
   distribution
2. **Queue Listener**: A handler function processes messages as they become
   available
3. **Automatic Scaling**: On Deno Deploy, isolates automatically spin up to
   handle messages
4. **Retry Mechanism**: Failed messages are automatically retried with
   exponential backoff

### Message Flow

```
┌─────────┐     enqueue()     ┌──────────┐     listenQueue()     ┌─────────┐
│Producer │ ─────────────────► │  Queue   │ ───────────────────► │Consumer │
└─────────┘                    │ (Deno KV)│                      └─────────┘
                               └──────────┘
                                    │
                                    ▼
                            ┌──────────────┐
                            │Backup Storage│
                            │(if delivery  │
                            │   fails)     │
                            └──────────────┘
```

### Processing Guarantees

- Messages are persisted in KV before acknowledgment
- Handlers should be idempotent to handle potential duplicate processing
- Failed messages are retried according to the backoff schedule
- Maximum of 100,000 undelivered messages per queue

## Complete Code Examples

### Basic Queue Usage

```typescript
// Basic message enqueue and processing
const kv = await Deno.openKv();

// Enqueue a simple message
await kv.enqueue("Hello, Queue!");

// Listen for and process messages
kv.listenQueue((msg: unknown) => {
  console.log("Received message:", msg);
});
```

### Typed Messages with Interface

```typescript
// Define a message interface
interface Notification {
  forUser: string;
  body: string;
  timestamp: number;
}

const kv = await Deno.openKv();

// Create and enqueue a typed message
const notification: Notification = {
  forUser: "alice",
  body: "You have a new message!",
  timestamp: Date.now(),
};

await kv.enqueue(notification);

// Type-safe message handler
kv.listenQueue((msg: Notification) => {
  console.log(`Notification for ${msg.forUser}: ${msg.body}`);
  // Send actual notification here
});
```

### Delayed Message Scheduling

```typescript
const kv = await Deno.openKv();

interface ScheduledTask {
  type: "email" | "reminder" | "cleanup";
  data: Record<string, unknown>;
}

// Schedule a task for 1 hour from now
const oneHour = 60 * 60 * 1000;
const task: ScheduledTask = {
  type: "reminder",
  data: { userId: "user123", message: "Meeting in 15 minutes" },
};

await kv.enqueue(task, { delay: oneHour });

// Schedule a task for specific time
const tomorrow = new Date();
tomorrow.setDate(tomorrow.getDate() + 1);
tomorrow.setHours(9, 0, 0, 0);
const delayUntilTomorrow = tomorrow.getTime() - Date.now();

await kv.enqueue(
  { type: "email", data: { subject: "Daily Report" } },
  { delay: delayUntilTomorrow },
);
```

### Error Handling with Backup Keys

```typescript
const kv = await Deno.openKv();

interface WebhookPayload {
  id: string;
  url: string;
  payload: Record<string, unknown>;
  attempts: number;
}

// Enqueue with backup for undelivered messages
const webhook: WebhookPayload = {
  id: crypto.randomUUID(),
  url: "https://api.example.com/webhook",
  payload: { event: "user.created", userId: "123" },
  attempts: 0,
};

const backupKey = ["failed_webhooks", webhook.id];
await kv.enqueue(webhook, {
  keysIfUndelivered: [backupKey],
  backoffSchedule: [1000, 5000, 10000], // Retry after 1s, 5s, 10s
});

// Process webhooks with error handling
kv.listenQueue(async (msg: WebhookPayload) => {
  try {
    const response = await fetch(msg.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(msg.payload),
    });

    if (!response.ok) {
      throw new Error(`Webhook failed: ${response.status}`);
    }

    console.log(`Webhook ${msg.id} delivered successfully`);
  } catch (error) {
    console.error(`Webhook ${msg.id} failed:`, error);
    throw error; // Re-throw to trigger retry
  }
});

// Later, check for failed webhooks
const failed = await kv.get<WebhookPayload>(backupKey);
if (failed.value) {
  console.log("Found failed webhook:", failed.value);
  // Handle or retry manually
}
```

### Atomic Transactions for Exactly-Once Processing

```typescript
const kv = await Deno.openKv();

interface Order {
  orderId: string;
  customerId: string;
  amount: number;
  nonce: string; // For deduplication
}

// Enqueue order for processing
const order: Order = {
  orderId: "ORD-123",
  customerId: "CUST-456",
  amount: 99.99,
  nonce: crypto.randomUUID(),
};

await kv.enqueue(order);

// Process with exactly-once semantics
kv.listenQueue(async (msg: Order) => {
  // Check if already processed
  const processed = await kv.get(["processed_orders", msg.nonce]);
  if (processed.value !== null) {
    console.log(`Order ${msg.orderId} already processed, skipping`);
    return;
  }

  // Process order atomically
  const result = await kv.atomic()
    .check(processed) // Ensure still not processed
    .set(["processed_orders", msg.nonce], true)
    .set(["orders", msg.orderId], msg)
    .sum(["customer_totals", msg.customerId], msg.amount)
    .commit();

  if (result.ok) {
    console.log(`Order ${msg.orderId} processed successfully`);
    // Send confirmation email, update inventory, etc.
  } else {
    console.log(`Order ${msg.orderId} processing failed, will retry`);
    throw new Error("Atomic transaction failed");
  }
});
```

### Batch Processing with Rate Limiting

```typescript
const kv = await Deno.openKv();

interface BatchJob {
  batchId: string;
  items: string[];
  processingRate: number; // items per second
}

// Enqueue batch job
const batch: BatchJob = {
  batchId: "BATCH-001",
  items: Array.from({ length: 100 }, (_, i) => `item-${i}`),
  processingRate: 10,
};

await kv.enqueue(batch);

// Process batch with rate limiting
kv.listenQueue(async (msg: BatchJob) => {
  const delayMs = 1000 / msg.processingRate;

  for (const item of msg.items) {
    // Process item
    console.log(`Processing ${item} from batch ${msg.batchId}`);

    // Store progress
    await kv.set(
      ["batch_progress", msg.batchId, item],
      { processed: true, timestamp: Date.now() },
    );

    // Rate limit
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  console.log(`Batch ${msg.batchId} completed`);
});
```

## Use Cases and Best Practices

### Common Use Cases

1. **Webhook Processing**
   - Offload webhook handling to avoid blocking HTTP responses
   - Implement retry logic for failed webhook deliveries
   - Store failed webhooks for manual inspection

2. **Email/Notification Sending**
   - Queue emails to avoid blocking user interactions
   - Schedule notifications for optimal delivery times
   - Batch notifications to reduce API calls

3. **Data Processing Pipelines**
   - Process large datasets asynchronously
   - Chain multiple processing steps
   - Implement fan-out/fan-in patterns

4. **Scheduled Tasks**
   - Cron-like job scheduling
   - Delayed task execution
   - Recurring task management

5. **Background Image/Video Processing**
   - Thumbnail generation
   - Video transcoding
   - Image optimization

6. **Order Processing**
   - Async order fulfillment
   - Payment processing
   - Inventory updates

### Best Practices

#### 1. Make Handlers Idempotent

```typescript
// Good: Idempotent handler
kv.listenQueue(async (msg: { id: string; amount: number }) => {
  const existing = await kv.get(["transactions", msg.id]);
  if (existing.value) {
    console.log("Transaction already processed");
    return;
  }

  await kv.set(["transactions", msg.id], {
    amount: msg.amount,
    processedAt: Date.now(),
  });
});
```

#### 2. Use Type Guards for Message Validation

```typescript
interface TypedMessage {
  type: string;
  data: unknown;
}

function isNotification(
  msg: TypedMessage,
): msg is { type: "notification"; data: Notification } {
  return msg.type === "notification";
}

kv.listenQueue((msg: TypedMessage) => {
  if (isNotification(msg)) {
    // Type-safe notification handling
    sendNotification(msg.data);
  }
});
```

#### 3. Implement Proper Error Handling

```typescript
kv.listenQueue(async (msg: unknown) => {
  try {
    await processMessage(msg);
  } catch (error) {
    if (error instanceof RateLimitError) {
      // Retry with delay
      await kv.enqueue(msg, { delay: 60000 });
      return; // Don't re-throw, avoid automatic retry
    }

    if (error instanceof PermanentError) {
      // Log and don't retry
      console.error("Permanent error:", error);
      await kv.set(["dead_letter", Date.now()], msg);
      return;
    }

    // Re-throw for automatic retry
    throw error;
  }
});
```

#### 4. Monitor Queue Health

```typescript
// Track queue metrics
let processedCount = 0;
let errorCount = 0;

kv.listenQueue(async (msg: unknown) => {
  const startTime = Date.now();

  try {
    await processMessage(msg);
    processedCount++;

    // Log metrics
    await kv.atomic()
      .sum(["metrics", "processed"], 1)
      .set(["metrics", "last_processed"], Date.now())
      .commit();
  } catch (error) {
    errorCount++;
    await kv.atomic()
      .sum(["metrics", "errors"], 1)
      .commit();
    throw error;
  } finally {
    const duration = Date.now() - startTime;
    console.log(`Processing time: ${duration}ms`);
  }
});
```

#### 5. Use Appropriate Delays

```typescript
// Avoid overwhelming external services
const rateLimitDelay = 100; // ms between requests
let lastProcessed = 0;

kv.listenQueue(async (msg: unknown) => {
  const now = Date.now();
  const timeSinceLastProcess = now - lastProcessed;

  if (timeSinceLastProcess < rateLimitDelay) {
    // Re-enqueue with delay
    await kv.enqueue(msg, {
      delay: rateLimitDelay - timeSinceLastProcess,
    });
    return;
  }

  lastProcessed = now;
  await processMessage(msg);
});
```

## API Reference

### `Deno.Kv.prototype.enqueue()`

Adds a value to the database queue for delivery to the queue listener.

#### Signature

```typescript
enqueue(
  value: unknown,
  options?: {
    delay?: number;
    keysIfUndelivered?: Deno.KvKey[];
    backoffSchedule?: number[];
  }
): Promise<Deno.KvCommitResult>
```

#### Parameters

- **`value`**: The message to enqueue. Can be any serializable JavaScript value.

- **`options`** (optional):
  - **`delay`**: Number of milliseconds to delay delivery (default: 0)
  - **`keysIfUndelivered`**: Array of KV keys where the message should be stored
    if delivery fails
  - **`backoffSchedule`**: Array of delays (in milliseconds) for retry attempts

#### Returns

Promise that resolves to a `KvCommitResult` containing:

- `ok`: Boolean indicating success
- `versionstamp`: Unique identifier for the enqueued message

#### Examples

```typescript
// Simple enqueue
await kv.enqueue("message");

// With all options
await kv.enqueue(data, {
  delay: 5000,
  keysIfUndelivered: [["failed", "messages", Date.now()]],
  backoffSchedule: [1000, 5000, 10000, 30000],
});
```

### `Deno.Kv.prototype.listenQueue()`

Registers a handler to process queued messages.

#### Signature

```typescript
listenQueue(
  handler: (value: unknown) => void | Promise<void>
): Promise<void>
```

#### Parameters

- **`handler`**: Function called for each dequeued message. Can be async.

#### Behavior

- Handler is called at least once per message
- Throwing an error triggers automatic retry
- Returning successfully acknowledges the message

#### Examples

```typescript
// Synchronous handler
kv.listenQueue((msg) => {
  console.log("Received:", msg);
});

// Asynchronous handler
kv.listenQueue(async (msg) => {
  await processMessage(msg);
});
```

## Error Handling and Debugging Tips

### Common Error Scenarios

#### 1. Queue Full Error

```typescript
try {
  await kv.enqueue(message);
} catch (error) {
  if (error.message.includes("queue is full")) {
    console.error("Queue has reached 100,000 undelivered messages");
    // Implement backpressure or alerting
  }
}
```

#### 2. Handler Timeout

```typescript
kv.listenQueue(async (msg) => {
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error("Timeout")), 30000)
  );

  try {
    await Promise.race([
      processMessage(msg),
      timeout,
    ]);
  } catch (error) {
    console.error("Processing timeout or error:", error);
    throw error;
  }
});
```

#### 3. Deserialization Errors

```typescript
kv.listenQueue((msg: unknown) => {
  try {
    // Validate message structure
    if (!isValidMessage(msg)) {
      console.error("Invalid message format:", msg);
      // Don't re-throw - message will be discarded
      return;
    }

    processValidMessage(msg);
  } catch (error) {
    console.error("Message processing error:", error);
    throw error;
  }
});
```

### Debugging Techniques

#### 1. Message Tracing

```typescript
interface TracedMessage {
  id: string;
  payload: unknown;
  enqueuedAt: number;
  attempts: number;
}

// Add tracing to messages
async function enqueueWithTracing(payload: unknown) {
  const message: TracedMessage = {
    id: crypto.randomUUID(),
    payload,
    enqueuedAt: Date.now(),
    attempts: 0,
  };

  console.log(`Enqueuing message ${message.id}`);
  await kv.enqueue(message);
  return message.id;
}

// Trace in handler
kv.listenQueue(async (msg: TracedMessage) => {
  const processingTime = Date.now() - msg.enqueuedAt;
  console.log(
    `Processing ${msg.id}, queue time: ${processingTime}ms, attempt: ${
      msg.attempts + 1
    }`,
  );

  try {
    await processPayload(msg.payload);
    console.log(`Successfully processed ${msg.id}`);
  } catch (error) {
    console.error(`Failed to process ${msg.id}:`, error);
    // Re-enqueue with incremented attempt count
    await kv.enqueue({
      ...msg,
      attempts: msg.attempts + 1,
    }, { delay: Math.min(1000 * Math.pow(2, msg.attempts), 60000) });
  }
});
```

#### 2. Queue Monitoring

```typescript
// Monitor queue health
async function monitorQueue() {
  const metrics = await kv.get(["metrics"]);
  console.log("Queue metrics:", metrics.value);

  // Check for stuck messages
  const lastProcessed = await kv.get(["metrics", "last_processed"]);
  if (lastProcessed.value) {
    const timeSinceLastProcess = Date.now() - lastProcessed.value as number;
    if (timeSinceLastProcess > 60000) {
      console.warn("No messages processed in the last minute");
    }
  }
}

// Run monitoring periodically
setInterval(monitorQueue, 30000);
```

#### 3. Dead Letter Queue Pattern

```typescript
interface QueueMessage {
  id: string;
  data: unknown;
  retries: number;
  maxRetries: number;
}

kv.listenQueue(async (msg: QueueMessage) => {
  try {
    await processMessage(msg.data);
  } catch (error) {
    console.error(`Processing failed for ${msg.id}:`, error);

    if (msg.retries >= msg.maxRetries) {
      // Move to dead letter queue
      await kv.set(["dead_letter_queue", msg.id], {
        message: msg,
        error: error.message,
        failedAt: Date.now(),
      });
      console.log(`Message ${msg.id} moved to dead letter queue`);
      return; // Don't re-throw
    }

    // Re-enqueue with incremented retry count
    await kv.enqueue({
      ...msg,
      retries: msg.retries + 1,
    }, { delay: 1000 * Math.pow(2, msg.retries) });
  }
});

// Process dead letter queue manually
async function processDeatLetterQueue() {
  const iter = kv.list({ prefix: ["dead_letter_queue"] });
  for await (const entry of iter) {
    console.log("Dead letter:", entry.key, entry.value);
    // Implement manual intervention logic
  }
}
```

### Testing Queues

```typescript
// Test helper for queue handlers
async function testQueueHandler(
  handler: (msg: unknown) => Promise<void>,
  testMessage: unknown,
) {
  const errors: Error[] = [];
  const processed: unknown[] = [];

  // Mock handler wrapper
  const testHandler = async (msg: unknown) => {
    try {
      await handler(msg);
      processed.push(msg);
    } catch (error) {
      errors.push(error as Error);
      throw error;
    }
  };

  // Simulate message processing
  await testHandler(testMessage);

  return { processed, errors };
}

// Example test
const result = await testQueueHandler(
  async (msg) => {
    if (typeof msg !== "string") {
      throw new Error("Invalid message type");
    }
    console.log("Processing:", msg);
  },
  "test message",
);

console.assert(result.processed.length === 1);
console.assert(result.errors.length === 0);
```

## Deployment Considerations

### Deno Deploy

- **Automatic Scaling**: Isolates spin up automatically when messages are
  available
- **Global Distribution**: Messages are processed close to where they're
  enqueued
- **No Configuration**: Queue handlers work without additional setup

### Self-Hosted Deno

- Ensure Deno KV is properly configured
- Monitor resource usage for queue processing
- Implement health checks for queue handlers

### Performance Optimization

1. **Batch Processing**: Group related messages to reduce overhead
2. **Connection Pooling**: Reuse connections in handlers
3. **Caching**: Cache frequently accessed data to reduce KV reads
4. **Parallel Processing**: Use Promise.all() for independent operations

### Limitations

- Maximum 100,000 undelivered messages per queue
- Message size limited by KV value size limits
- No built-in message prioritization
- No strict ordering guarantees

## Running Examples

To run the queue examples:

```bash
# Basic example
deno run --unstable-kv examples/basic-queue.ts

# With all permissions for complete example
deno run --allow-net --unstable-kv examples/webhook-processor.ts

# From Deno documentation
deno run --unstable-kv https://docs.deno.com/examples/scripts/queues.ts
```

## Additional Resources

- [Deno KV Documentation](https://docs.deno.com/deploy/kv/manual/)
- [Deno Queues User Guide](https://docs.deno.com/deploy/kv/manual/queue_overview/)
- [Deno KV API Reference](https://docs.deno.com/api/deno/~/Deno.Kv)
- [Deno Deploy Documentation](https://docs.deno.com/deploy/)
- [Deno Queues Announcement Blog](https://deno.com/blog/queues)

## Summary

Deno Queues provides a robust, serverless-ready message queue system that
integrates seamlessly with Deno KV. With features like automatic retries,
delayed execution, and backup storage for failed messages, it's suitable for a
wide range of asynchronous processing needs. By following best practices like
making handlers idempotent and implementing proper error handling, you can build
reliable distributed systems that scale automatically with your workload.

Remember that Deno Queues is currently an unstable API, so stay updated with the
latest Deno releases for any changes or improvements to the queue system.
